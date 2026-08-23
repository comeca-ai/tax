import {
  CATEGORIAS_DESPESA,
  regrasPoliticaSchema,
  type CategoriaDespesa,
  type PolicyExtracao,
  type RegrasPolitica,
} from "@contracts/types";
import type { ArquivoPolitica, PolicyParser } from "./parser";

/**
 * Parser LLM da política de reembolso via Mistral (v1.6.0).
 *
 * Dois passos, porque a Mistral não lê PDF nativo no chat como o Gemini:
 *   1) OCR  (POST /v1/ocr, mistral-ocr-latest) → markdown do documento;
 *   2) Chat (POST /v1/chat/completions, response_format json_object) → ruleset
 *      organizado pelos grandes temas de reembolso, no mesmo contrato validado
 *      no Workflow_ocr. O resultado é mapeado para o contrato estável
 *      `RegrasPolitica` + observações tematizadas.
 *
 * Documento em texto (mime text/*) pula o OCR e vai direto pro chat.
 *
 * Env:
 *  - MISTRAL_API_KEY     (obrigatória p/ este provider)
 *  - MISTRAL_MODEL       (default "mistral-large-latest")
 *  - MISTRAL_OCR_MODEL   (default "mistral-ocr-latest")
 *
 * Falhas (rede/quota/JSON inválido) caem no parser de fallback (heurístico)
 * com aviso — o upload nunca quebra por indisponibilidade do LLM.
 */

const TEMAS = [
  ["alimentacao", "Alimentação"],
  ["transporte-e-deslocamento", "Transporte e deslocamento"],
  ["hospedagem-e-viagem", "Hospedagem e viagem"],
  ["saude", "Saúde"],
  ["educacao-e-desenvolvimento", "Educação e desenvolvimento"],
  ["tecnologia-e-escritorio", "Tecnologia e escritório"],
  ["eventos-e-relacionamento", "Eventos e relacionamento"],
  ["mudanca-e-transferencia", "Mudança e transferência"],
  ["governanca-do-processo", "Governança do processo"],
] as const;

const PROMPT_EXTRACAO = `Voce e um analista senior de politicas corporativas de reembolso de despesas.
Leia o documento abaixo (politica de reembolso de uma empresa) e extraia TODAS as regras de reembolso.

Organize o resultado pelos GRANDES TEMAS abaixo. Use exatamente estes nove temas (slug - titulo), nesta ordem, e devolva sempre os nove, mesmo que algum fique sem regras:
1. alimentacao - Alimentacao
2. transporte-e-deslocamento - Transporte e deslocamento
3. hospedagem-e-viagem - Hospedagem e viagem
4. saude - Saude
5. educacao-e-desenvolvimento - Educacao e desenvolvimento
6. tecnologia-e-escritorio - Tecnologia e escritorio
7. eventos-e-relacionamento - Eventos e relacionamento
8. mudanca-e-transferencia - Mudanca e transferencia
9. governanca-do-processo - Governanca do processo (prazos, comprovacao, alcada de aprovacao, pagamento, adiantamento)

Regras de preenchimento:
- Toda regra recebe "tema" com o slug de um dos nove temas.
- Toda regra recebe "categoria" com um destes valores: alimentacao, transporte, hospedagem, km, saude, educacao, outros.
- "reembolsavel" so aceita: "sim" (reembolsavel dentro da regra), "excecao" (apenas com aprovacao superior) ou "vedado" (nunca reembolsavel).
- Cada limite monetario vira uma regra propria. "valor_limite" e numero puro, sem simbolo e sem separador de milhar.
- Nao invente valores. Se a politica nao definir limite, use null e registre o caso em "ambiguidades".
- Em "temas", os contadores devem bater com a lista "regras".
- Liste em "ambiguidades" todo ponto que impeca decisao automatica: limite ausente, recomendacao que nao e vedacao, prazo com contagem indefinida, conflito entre secoes.
- Use apenas o que esta escrito no documento. Nao aplique conhecimento externo.

Responda APENAS com um JSON valido (sem markdown, sem comentarios), exatamente nesta estrutura:
{
  "politica": { "titulo": string, "vigencia": string ou null, "moeda_padrao": string },
  "qualidade_extracao": { "legivel": boolean, "confianca": numero entre 0 e 1, "paginas_com_problema": [numeros], "observacoes": string },
  "temas": [ { "tema": string, "titulo": string, "total_regras": numero, "reembolsaveis": numero, "excecoes": numero, "vedadas": numero, "regras": [ids] } ],
  "regras": [ { "id": string kebab-case, "tema": string, "categoria": string, "descricao": string, "condicao": string ou null, "reembolsavel": "sim"|"excecao"|"vedado", "valor_limite": numero ou null, "moeda": string ou null, "unidade_limite": "dia"|"mes"|"viagem"|"evento"|"percentual"|"dias_antecedencia"|"dias_para_pagamento" ou null, "escopo": "nacional"|"internacional"|"ambos", "exige_comprovante": boolean, "aprovacao_minima": string ou null, "prazo_envio_dias": numero ou null, "base_documental": string } ],
  "ambiguidades": [ { "id": string kebab-case, "severidade": "alta"|"media"|"baixa", "local": string, "descricao": string, "impacto": string } ]
}`;

type RegraLLM = {
  id?: string;
  tema?: string;
  categoria?: string;
  descricao?: string;
  condicao?: string | null;
  reembolsavel?: string;
  valor_limite?: number | null;
  moeda?: string | null;
  unidade_limite?: string | null;
  limite?: { valor?: number | null; moeda?: string | null; unidade?: string | null } | null;
  escopo?: string;
  exige_comprovante?: boolean;
  aprovacao_minima?: string | null;
  prazo_envio_dias?: number | null;
  base_documental?: string;
  referencia?: string;
};

type RulesetLLM = {
  politica?: { titulo?: string; vigencia?: string | null; moeda_padrao?: string };
  qualidade_extracao?: { legivel?: boolean; confianca?: number; observacoes?: string };
  regras?: RegraLLM[];
  ambiguidades?: { severidade?: string; local?: string; descricao?: string; impacto?: string }[];
};

const TEMA_TITULO = new Map<string, string>(TEMAS.map(([slug, titulo]) => [slug, titulo]));

function categoriaApp(r: RegraLLM): CategoriaDespesa | null {
  const texto = `${r.id ?? ""} ${r.descricao ?? ""}`.toLowerCase();
  if (r.categoria === "alimentacao") return "alimentacao";
  if (r.categoria === "hospedagem") return "hospedagem";
  if (r.categoria === "transporte" || r.categoria === "km") {
    if (/combust|abastec|gasolina|etanol|diesel/.test(texto)) return "combustivel";
    if (/ped[aá]gio/.test(texto)) return "pedagio";
    if (/t[aá]xi/.test(texto)) return "taxi";
    if (/uber|99|aplicativo/.test(texto)) return "uber";
    return null;
  }
  return null;
}

function valorLimite(r: RegraLLM): number | null {
  const direto = typeof r.valor_limite === "number" ? r.valor_limite : null;
  const objeto = typeof r.limite?.valor === "number" ? r.limite.valor : null;
  const v = direto ?? objeto;
  return v !== null && Number.isFinite(v) && v >= 0 ? v : null;
}

function moedaDe(r: RegraLLM): string {
  return (r.moeda ?? r.limite?.moeda ?? "BRL").toUpperCase();
}

function fmtValor(r: RegraLLM): string {
  const v = valorLimite(r);
  if (v === null) return "";
  const unidade = r.unidade_limite ?? r.limite?.unidade ?? null;
  const sufixo = unidade && !unidade.startsWith("dias_") ? `/${unidade}` : "";
  return ` — até ${moedaDe(r) === "BRL" ? "R$" : moedaDe(r)} ${v}${sufixo}`;
}

/** Converte o ruleset temático do LLM no contrato estável RegrasPolitica. */
export function mapearRuleset(ruleset: RulesetLLM): {
  regras: RegrasPolitica;
  camposPendentes: string[];
  resumo: string;
} {
  const regras = Array.isArray(ruleset.regras) ? ruleset.regras : [];
  const ambiguidades = Array.isArray(ruleset.ambiguidades) ? ruleset.ambiguidades : [];

  const limites: Partial<Record<CategoriaDespesa, number | null>> = {};
  for (const cat of CATEGORIAS_DESPESA) {
    const valores = regras
      .filter((r) => categoriaApp(r) === cat && r.reembolsavel === "sim" && moedaDe(r) === "BRL")
      .map((r) => valorLimite(r))
      .filter((v): v is number => v !== null);
    if (valores.length) limites[cat] = Math.max(...valores);
  }

  const exigeEvidencia = regras.some((r) => r.exige_comprovante) ? [...CATEGORIAS_DESPESA] : [];

  const porTema = new Map<string, string[]>();
  for (const [slug] of TEMAS) porTema.set(slug, []);
  for (const r of regras) {
    if (!r.descricao) continue;
    const slug = r.tema && TEMA_TITULO.has(r.tema) ? r.tema : "governanca-do-processo";
    const marcador =
      r.reembolsavel === "vedado" ? "VEDADO: " : r.reembolsavel === "excecao" ? "EXCEÇÃO (aprovação superior): " : "";
    const condicao = r.condicao ? ` (${r.condicao})` : "";
    porTema.get(slug)!.push(`${marcador}${r.descricao}${fmtValor(r)}${condicao}`);
  }
  const observacoes: string[] = [];
  for (const [slug, titulo] of TEMAS) {
    const linhas = porTema.get(slug) ?? [];
    if (!linhas.length) continue;
    observacoes.push(`— ${titulo} —`);
    for (const linha of linhas) observacoes.push(linha);
  }

  const camposPendentes = [
    "aprovacaoAutomaticaAte (política não define teto de aprovação automática)",
    "revisaoHumanaAcimaDe (política não define valor de corte para revisão)",
    "negacaoAcimaDe (política não define teto de negação)",
    ...ambiguidades.slice(0, 15).map((a) => `${a.local ?? "documento"}: ${a.descricao ?? ""}`.slice(0, 200)),
  ];

  const totalPorTipo = (tipo: string) => regras.filter((r) => r.reembolsavel === tipo).length;
  const resumo = [
    `Política: ${ruleset.politica?.titulo ?? "(sem título)"}`,
    `Vigência: ${ruleset.politica?.vigencia ?? "não informada"}`,
    `Regras extraídas: ${regras.length} (${totalPorTipo("sim")} reembolsáveis, ${totalPorTipo("excecao")} exceções, ${totalPorTipo("vedado")} vedadas)`,
    `Ambiguidades sinalizadas: ${ambiguidades.length}`,
  ].join("\n");

  return {
    regras: regrasPoliticaSchema.parse({
      limitesPorCategoria: limites,
      exigeVeiculoCadastrado: [],
      exigeEvidencia,
      aprovacaoAutomaticaAte: null,
      revisaoHumanaAcimaDe: null,
      negacaoAcimaDe: null,
      observacoes,
    }),
    camposPendentes,
    resumo,
  };
}

async function comTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), ms);
  try {
    return await fn(controle.signal);
  } finally {
    clearTimeout(timer);
  }
}

/** Passo 1: OCR do documento (PDF/imagem) → texto markdown. */
async function ocrDocumento(input: ArquivoPolitica, apiKey: string, modelo: string): Promise<string> {
  const mime = (input.mimeType || "application/pdf").toLowerCase();
  const dataUri = `data:${mime};base64,${input.base64}`;
  const document = mime.startsWith("image/")
    ? { type: "image_url", image_url: dataUri }
    : { type: "document_url", document_url: dataUri };

  const resposta = await comTimeout(
    (signal) =>
      fetch("https://api.mistral.ai/v1/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: modelo, document, include_image_base64: false }),
        signal,
      }),
    120_000,
  );
  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => "");
    throw new Error(`Mistral OCR HTTP ${resposta.status}: ${corpo.slice(0, 200)}`);
  }
  const dados = (await resposta.json()) as { pages?: { markdown?: string }[] };
  const texto = (dados.pages ?? []).map((p) => p.markdown ?? "").join("\n\n").trim();
  if (!texto) throw new Error("Mistral OCR retornou texto vazio");
  return texto;
}

/** Passo 2: chat estrutura o texto no ruleset JSON. */
async function estruturarRuleset(texto: string, apiKey: string, modelo: string): Promise<RulesetLLM> {
  let ultimaFalha = "";
  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    const resposta = await comTimeout(
      (signal) =>
        fetch("https://api.mistral.ai/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: modelo,
            temperature: 0.1,
            max_tokens: 8000,
            response_format: { type: "json_object" },
            messages: [
              { role: "user", content: `${PROMPT_EXTRACAO}\n\nDOCUMENTO (texto extraído por OCR):\n${texto.slice(0, 120_000)}` },
            ],
          }),
          signal,
        }),
      150_000,
    );
    if (!resposta.ok) {
      ultimaFalha = `Mistral chat HTTP ${resposta.status}`;
      if (resposta.status >= 500 || resposta.status === 429) {
        await new Promise((r) => setTimeout(r, 2000 * tentativa));
        continue;
      }
      const corpo = await resposta.text().catch(() => "");
      throw new Error(`${ultimaFalha}: ${corpo.slice(0, 200)}`);
    }
    const dados = (await resposta.json()) as { choices?: { message?: { content?: string } }[] };
    const conteudo = dados.choices?.[0]?.message?.content ?? "";
    if (!conteudo) throw new Error("Mistral chat sem conteúdo na resposta");
    const semCercas = conteudo.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    return JSON.parse(semCercas) as RulesetLLM;
  }
  throw new Error(ultimaFalha || "Mistral indisponível");
}

export class MistralPolicyParser implements PolicyParser {
  nome = "mistral";

  constructor(private criarFallback?: () => PolicyParser) {}

  async extract(input: ArquivoPolitica): Promise<PolicyExtracao> {
    const apiKey = process.env.MISTRAL_API_KEY;
    const modelo = process.env.MISTRAL_MODEL ?? "mistral-large-latest";
    const modeloOcr = process.env.MISTRAL_OCR_MODEL ?? "mistral-ocr-latest";

    if (!apiKey) {
      if (this.criarFallback) {
        const resultado = await this.criarFallback().extract(input);
        return {
          ...resultado,
          avisos: [...resultado.avisos, "MISTRAL_API_KEY ausente: extração heurística usada no lugar do LLM."],
        };
      }
      throw new Error("POLICY_PROVIDER=mistral sem MISTRAL_API_KEY configurada.");
    }

    try {
      const mime = (input.mimeType || "application/pdf").toLowerCase();
      const texto = mime.startsWith("text/")
        ? Buffer.from(input.base64, "base64").toString("utf8")
        : await ocrDocumento(input, apiKey, modeloOcr);

      const ruleset = await estruturarRuleset(texto, apiKey, modelo);
      const bruto = ruleset.qualidade_extracao?.confianca;
      const confianca = typeof bruto === "number" ? Math.max(0, Math.min(1, bruto)) : 0;
      const { regras, camposPendentes, resumo } = mapearRuleset(ruleset);
      return {
        textoExtraido: resumo,
        regras,
        confiancaExtracao: confianca >= 0.85 ? "alta" : confianca >= 0.7 ? "media" : "baixa",
        camposPendentes,
        provedor: `mistral:${modelo}`,
        avisos: ruleset.qualidade_extracao?.observacoes ? [ruleset.qualidade_extracao.observacoes] : [],
      };
    } catch (erro) {
      if (!this.criarFallback) throw erro;
      const resultado = await this.criarFallback().extract(input);
      const motivo = erro instanceof Error ? erro.message : String(erro);
      return {
        ...resultado,
        confiancaExtracao: "baixa",
        avisos: [...resultado.avisos, `LLM indisponível (${motivo}): extração heurística usada como contingência.`],
      };
    }
  }
}

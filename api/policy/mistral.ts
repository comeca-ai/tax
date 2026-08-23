import {
  REEMBOLSAVEL_REGRA,
  REGRA_TEXTO_MAX,
  TEMAS_POLITICA,
  UNIDADES_LIMITE,
  regrasPoliticaSchema,
  type CategoriaDespesa,
  type PolicyExtracao,
  type RegraExtraida,
  type RegrasPolitica,
  type ReembolsavelRegra,
  type TemaPolitica,
  type UnidadeLimite,
} from "@contracts/types";
import { consolidarRegras } from "./derivar";
import type { ArquivoPolitica, PolicyParser } from "./parser";
import { LIMITE_TEXTO_EXTRAIDO_BYTES, truncarUtf8 } from "./texto";

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
 *  - MISTRAL_MODEL       (default "mistral-medium-latest" — ~2× mais rápido que o large na extração, mesma qualidade)
 *  - MISTRAL_OCR_MODEL   (default "mistral-ocr-latest")
 *
 * Falhas (rede/quota/JSON inválido) caem no parser de fallback (heurístico)
 * com aviso — o upload nunca quebra por indisponibilidade do LLM.
 */

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
- Liste em "ambiguidades" todo ponto que impeca decisao automatica: limite ausente, recomendacao que nao e vedacao, prazo com contagem indefinida, conflito entre secoes.
- Use apenas o que esta escrito no documento. Nao aplique conhecimento externo.
- Seja conciso: "descricao" e "condicao" com no maximo 200 caracteres cada, sem copiar paragrafos do documento; no maximo 15 ambiguidades, as mais relevantes.

Responda APENAS com um JSON valido, COMPACTO (sem markdown, sem comentarios, sem quebras de linha ou espacos decorativos), exatamente nesta estrutura:
{
  "politica": { "titulo": string, "vigencia": string ou null, "moeda_padrao": string },
  "qualidade_extracao": { "legivel": boolean, "confianca": numero entre 0 e 1, "paginas_com_problema": [numeros], "observacoes": string },
  "regras": [ { "id": string kebab-case, "tema": string, "categoria": string, "descricao": string, "condicao": string ou null, "reembolsavel": "sim"|"excecao"|"vedado", "valor_limite": numero ou null, "moeda": string ou null, "unidade_limite": "dia"|"mes"|"viagem"|"evento"|"percentual"|"dias_antecedencia"|"dias_para_pagamento" ou null, "exige_comprovante": boolean } ],
  "ambiguidades": [ { "id": string kebab-case, "severidade": "alta"|"media"|"baixa", "local": string, "descricao": string } ]
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
  qualidade_extracao?: {
    legivel?: boolean;
    confianca?: number;
    paginas_com_problema?: number[];
    observacoes?: string;
  };
  regras?: RegraLLM[];
  ambiguidades?: { severidade?: string; local?: string; descricao?: string; impacto?: string }[];
};

const TEMAS_VALIDOS = new Set<string>(TEMAS_POLITICA.map(([slug]) => slug));
const REEMBOLSAVEIS_VALIDOS = new Set<string>(REEMBOLSAVEL_REGRA);
const UNIDADES_VALIDAS = new Set<string>(UNIDADES_LIMITE);

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

/** Moeda ISO (3 letras, maiúsculas); qualquer outra coisa vira BRL. */
function moedaDe(r: RegraLLM): string {
  const bruta = r.moeda ?? r.limite?.moeda;
  const moeda = typeof bruta === "string" ? bruta.trim().toUpperCase() : "BRL";
  return /^[A-Z]{3}$/.test(moeda) ? moeda : "BRL";
}

function unidadeDe(r: RegraLLM): UnidadeLimite | null {
  const unidade = r.unidade_limite ?? r.limite?.unidade ?? null;
  return typeof unidade === "string" && UNIDADES_VALIDAS.has(unidade) ? (unidade as UnidadeLimite) : null;
}

/** Texto do LLM saneado: string não vazia, trim, até REGRA_TEXTO_MAX caracteres; senão null. */
function texto300(valor: unknown): string | null {
  const limpo = typeof valor === "string" ? valor.trim().slice(0, REGRA_TEXTO_MAX).trim() : "";
  return limpo ? limpo : null;
}

/** Id kebab-case `[a-z0-9-]`; vazio → `regra-N`; repetido → sufixo `-2`, `-3`… */
function idUnico(bruto: unknown, indice: number, usados: Set<string>): string {
  const base =
    (typeof bruto === "string" ? bruto : "")
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 70) || `regra-${indice + 1}`;
  let id = base;
  for (let n = 2; usados.has(id); n++) id = `${base}-${n}`;
  usados.add(id);
  return id;
}

/** Sanea cada regra do LLM no contrato `RegraExtraida` (lixo parcial nunca derruba o upload). */
function regrasExtraidasDe(regras: RegraLLM[]): RegraExtraida[] {
  const usados = new Set<string>();
  const out: RegraExtraida[] = [];
  regras.forEach((r, i) => {
    if (out.length >= 500) return; // teto do contrato (regrasExtraidas.max(500))
    const descricao = texto300(r.descricao);
    if (!descricao) return;
    out.push({
      id: idUnico(r.id, i, usados),
      tema: typeof r.tema === "string" && TEMAS_VALIDOS.has(r.tema) ? (r.tema as TemaPolitica) : "governanca-do-processo",
      categoria: categoriaApp(r),
      descricao,
      condicao: texto300(r.condicao),
      reembolsavel:
        typeof r.reembolsavel === "string" && REEMBOLSAVEIS_VALIDOS.has(r.reembolsavel)
          ? (r.reembolsavel as ReembolsavelRegra)
          : "sim",
      valorLimite: valorLimite(r),
      moeda: moedaDe(r),
      unidadeLimite: unidadeDe(r),
      exigeComprovante: r.exige_comprovante === true,
    });
  });
  return out;
}

/** Avisos ao gestor a partir do bloco `qualidade_extracao` devolvido pelo modelo. */
export function avisosQualidade(q: RulesetLLM["qualidade_extracao"]): string[] {
  const out: string[] = [];
  if (q?.observacoes) out.push(q.observacoes);
  const paginas = Array.isArray(q?.paginas_com_problema)
    ? q.paginas_com_problema.filter((p) => Number.isInteger(p) && p > 0)
    : [];
  if (paginas.length) {
    out.push(
      `Páginas com problema de leitura: ${paginas.join(", ")}. Confira o texto lido nesses trechos.`,
    );
  }
  if (q && q.legivel === false) {
    out.push("O modelo sinalizou o documento como pouco legível. Revise todas as regras.");
  }
  return out;
}

/** Converte o ruleset temático do LLM no contrato estável RegrasPolitica (parâmetros derivados das regras). */
export function mapearRuleset(ruleset: RulesetLLM): {
  regras: RegrasPolitica;
  camposPendentes: string[];
  resumo: string;
} {
  const regras = Array.isArray(ruleset.regras) ? ruleset.regras : [];
  const ambiguidades = Array.isArray(ruleset.ambiguidades) ? ruleset.ambiguidades : [];

  const regrasExtraidas = regrasExtraidasDe(regras);

  const camposPendentes = ambiguidades
    .slice(0, 15)
    .map((a) => `${a.local ?? "documento"}: ${a.descricao ?? ""}`.slice(0, 200));

  const totalPorTipo = (tipo: string) => regras.filter((r) => r.reembolsavel === tipo).length;
  const resumo = [
    `Política: ${ruleset.politica?.titulo ?? "(sem título)"}`,
    `Vigência: ${ruleset.politica?.vigencia ?? "não informada"}`,
    `Regras extraídas: ${regras.length} (${totalPorTipo("sim")} reembolsáveis, ${totalPorTipo("excecao")} exceções, ${totalPorTipo("vedado")} vedadas)`,
    `Ambiguidades sinalizadas: ${ambiguidades.length}`,
  ].join("\n");

  return {
    regras: consolidarRegras(regrasPoliticaSchema.parse({ regrasExtraidas })),
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

/** Teto de tokens da resposta JSON. 8 000 cortava políticas com dezenas de regras (~25 KB de JSON). */
const MAX_TOKENS_SAIDA = 32_000;

/** Passo 2: chat estrutura o texto no ruleset JSON. */
async function estruturarRuleset(texto: string, apiKey: string, modelo: string): Promise<RulesetLLM> {
  let ultimaFalha = "";
  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    // 2ª tentativa após resposta cortada/inválida: pede o mesmo JSON de forma compacta
    const instrucaoCompacta = ultimaFalha.startsWith("cortada")
      ? "\n\nIMPORTANTE: a resposta anterior foi cortada por tamanho. Responda o MESMO JSON de forma compacta: sem espacos ou quebras de linha decorativas, campos de texto curtos (ate 200 caracteres), sem repetir trechos do documento."
      : "";
    const resposta = await comTimeout(
      (signal) =>
        fetch("https://api.mistral.ai/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: modelo,
            temperature: 0.1,
            max_tokens: MAX_TOKENS_SAIDA,
            response_format: { type: "json_object" },
            messages: [
              {
                role: "user",
                content: `${PROMPT_EXTRACAO}${instrucaoCompacta}\n\nDOCUMENTO (texto extraído por OCR):\n${texto.slice(0, 120_000)}`,
              },
            ],
          }),
          signal,
        }),
      240_000, // políticas longas: ~50-110 tokens/s × até 8k tokens de JSON; nginx está em 420 s
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
    const dados = (await resposta.json()) as {
      choices?: { message?: { content?: string }; finish_reason?: string }[];
    };
    const escolha = dados.choices?.[0];
    const conteudo = escolha?.message?.content ?? "";
    if (!conteudo) throw new Error("Mistral chat sem conteúdo na resposta");
    // Resposta cortada pelo limite de tokens: JSON inválido garantido — repete pedindo compactação
    if (escolha?.finish_reason === "length") {
      ultimaFalha = `cortada pelo limite de ${MAX_TOKENS_SAIDA} tokens de saída`;
      continue;
    }
    const semCercas = conteudo.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    try {
      return JSON.parse(semCercas) as RulesetLLM;
    } catch (erro) {
      ultimaFalha = `cortada/inválida (${erro instanceof Error ? erro.message : String(erro)})`;
      continue;
    }
  }
  throw new Error(ultimaFalha || "Mistral indisponível");
}

export class MistralPolicyParser implements PolicyParser {
  nome = "mistral";

  constructor(private criarFallback?: () => PolicyParser) {}

  async extract(input: ArquivoPolitica): Promise<PolicyExtracao> {
    const apiKey = process.env.MISTRAL_API_KEY;
    const modelo = process.env.MISTRAL_MODEL ?? "mistral-medium-latest";
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
        textoExtraido: truncarUtf8(texto, LIMITE_TEXTO_EXTRAIDO_BYTES),
        regras,
        confiancaExtracao: confianca >= 0.85 ? "alta" : confianca >= 0.7 ? "media" : "baixa",
        camposPendentes,
        provedor: `mistral:${modelo}`,
        avisos: [resumo.replace(/\n/g, " · "), ...avisosQualidade(ruleset.qualidade_extracao)],
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

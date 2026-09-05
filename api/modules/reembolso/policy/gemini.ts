import {
  regrasPoliticaSchema,
  type PolicyExtracao,
  type RegrasPolitica,
} from "@contracts/types";
import { consolidarRegras } from "./derivar";
import { regrasExtraidasDe, type RegraLLM } from "./mistral";
import type { ArquivoPolitica, PolicyParser } from "./parser";

/**
 * Parser LLM da política de reembolso via Google Gemini (v1.5.0).
 *
 * Usa o mesmo prompt/contrato JSON validado no Workflow_ocr (GCP Workflows):
 * o modelo lê o documento (PDF/imagem/texto) e devolve um ruleset organizado
 * pelos grandes temas de reembolso; aqui o ruleset é mapeado para o contrato
 * estável `RegrasPolitica` + observações tematizadas.
 *
 * Env:
 *  - GEMINI_API_KEY        (obrigatória p/ este provider)
 *  - OCR_GEMINI_MODEL   (default "gemini-2.5-flash")
 *
 * Falhas de LLM (rede/quota/JSON inválido) caem no parser de fallback
 * (heurístico) com aviso — o upload nunca quebra por indisponibilidade do LLM.
 */

const PROMPT_EXTRACAO = `Voce e um analista senior de politicas corporativas de reembolso de despesas.
Leia o documento anexo (politica de reembolso de uma empresa) e extraia TODAS as regras de reembolso.

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
- "alcance" diz se a regra vale para a CATEGORIA INTEIRA ou para um SUB-ITEM dela. Use "categoria" apenas quando a regra define o limite, a vedacao ou a permissao geral daquele tipo de despesa (ex.: "Hospedagem: ate R$ 400 por diaria"). Use "item" para sub-itens e acessorios (ex.: lavanderia, frigobar, gorjeta, estacionamento do hotel). Na duvida, use "item".
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
  "regras": [ { "id": string kebab-case, "tema": string, "categoria": string, "alcance": "categoria"|"item", "descricao": string, "condicao": string ou null, "reembolsavel": "sim"|"excecao"|"vedado", "valor_limite": numero ou null, "moeda": string ou null, "unidade_limite": "dia"|"mes"|"viagem"|"evento"|"percentual"|"dias_antecedencia"|"dias_para_pagamento" ou null, "escopo": "nacional"|"internacional"|"ambos", "exige_comprovante": boolean, "aprovacao_minima": string ou null, "prazo_envio_dias": numero ou null, "base_documental": string } ],
  "ambiguidades": [ { "id": string kebab-case, "severidade": "alta"|"media"|"baixa", "local": string, "descricao": string, "impacto": string } ]
}`;

type RulesetLLM = {
  politica?: { titulo?: string; vigencia?: string | null; moeda_padrao?: string };
  qualidade_extracao?: { legivel?: boolean; confianca?: number; observacoes?: string };
  regras?: RegraLLM[];
  ambiguidades?: { severidade?: string; local?: string; descricao?: string; impacto?: string }[];
};

/**
 * Converte o ruleset temático do LLM no contrato estável RegrasPolitica.
 * As regras extraídas são a única fonte: limites, exigências, vedações e observações
 * saem de `consolidarRegras()` — o mesmo caminho do parser Mistral (v1.8).
 */
export function mapearRuleset(ruleset: RulesetLLM): {
  regras: RegrasPolitica;
  camposPendentes: string[];
  resumo: string;
} {
  const regras = Array.isArray(ruleset.regras) ? ruleset.regras : [];
  const ambiguidades = Array.isArray(ruleset.ambiguidades) ? ruleset.ambiguidades : [];

  const regrasExtraidas = regrasExtraidasDe(regras);

  const camposPendentes = [
    "aprovacaoAutomaticaAte (política não define teto de aprovação automática)",
    "revisaoHumanaAcimaDe (política não define valor de corte para revisão)",
    "negacaoAcimaDe (política não define teto de negação)",
    ...ambiguidades
      .slice(0, 15)
      .map((a) => `${a.local ?? "documento"}: ${a.descricao ?? ""}`.slice(0, 200)),
  ];

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

async function chamarGemini(input: ArquivoPolitica, apiKey: string, modelo: string): Promise<RulesetLLM> {
  const mime = (input.mimeType || "application/pdf").toLowerCase();
  const parteDocumento = mime.startsWith("text/")
    ? { text: Buffer.from(input.base64, "base64").toString("utf8").slice(0, 120_000) }
    : { inline_data: { mime_type: mime, data: input.base64 } };

  const corpo = {
    contents: [{ role: "user", parts: [{ text: PROMPT_EXTRACAO }, parteDocumento] }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 32768,
      responseMimeType: "application/json",
    },
  };

  let ultimaFalha = "";
  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    const controle = new AbortController();
    const timer = setTimeout(() => controle.abort(), 150_000);
    try {
      const resposta = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify(corpo),
          signal: controle.signal,
        },
      );
      if (!resposta.ok) {
        ultimaFalha = `Gemini HTTP ${resposta.status}`;
        if (resposta.status >= 500 || resposta.status === 429) {
          await new Promise((r) => setTimeout(r, 2000 * tentativa));
          continue;
        }
        throw new Error(ultimaFalha);
      }
      const dados = (await resposta.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
      };
      const texto = (dados.candidates?.[0]?.content?.parts ?? [])
        .map((p) => p.text ?? "")
        .join("");
      if (!texto) throw new Error(`Gemini sem texto na resposta (finishReason=${dados.candidates?.[0]?.finishReason ?? "?"})`);
      const semCercas = texto.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      return JSON.parse(semCercas) as RulesetLLM;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(ultimaFalha || "Gemini indisponível");
}

export class GeminiPolicyParser implements PolicyParser {
  nome = "gemini";

  // atribuição explícita (parameter property não compila com erasableSyntaxOnly)
  private criarFallback?: () => PolicyParser;

  constructor(criarFallback?: () => PolicyParser) {
    this.criarFallback = criarFallback;
  }

  async extract(input: ArquivoPolitica): Promise<PolicyExtracao> {
    const apiKey = process.env.GEMINI_API_KEY;
    const modelo = process.env.OCR_GEMINI_MODEL ?? "gemini-2.5-flash";

    if (!apiKey) {
      if (this.criarFallback) {
        const resultado = await this.criarFallback().extract(input);
        return {
          ...resultado,
          avisos: [...resultado.avisos, "GEMINI_API_KEY ausente: extração heurística usada no lugar do LLM."],
        };
      }
      throw new Error("POLICY_PROVIDER=llm sem GEMINI_API_KEY configurada.");
    }

    try {
      const ruleset = await chamarGemini(input, apiKey, modelo);
      const bruto = ruleset.qualidade_extracao?.confianca;
      const confianca = typeof bruto === "number" ? Math.max(0, Math.min(1, bruto)) : 0;
      const { regras, camposPendentes, resumo } = mapearRuleset(ruleset);
      return {
        textoExtraido: resumo,
        regras,
        confiancaExtracao: confianca >= 0.85 ? "alta" : confianca >= 0.7 ? "media" : "baixa",
        camposPendentes,
        provedor: `gemini:${modelo}`,
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

import type { CategoriaDespesa, OcrExtracao } from "@contracts/types";
import type { ArquivoNota, OcrProvider } from "./index";

/**
 * Provider de OCR por IA de visão (v1.7.0) — D-014.
 *
 * Estratégia:
 *  - XML/texto continua no heurístico (rápido e grátis).
 *  - Imagem/PDF escaneado vai para IA de visão: OpenAI primeiro, Gemini de
 *    fallback (ou o que tiver chave configurada).
 *  - NUNCA lança erro para cima: se nada conseguiu ler, devolve extração
 *    "baixa" com camposPendentes — o decisor manda para revisão manual.
 *    Ninguém preenche nada.
 *
 * Env:
 *   OCR_PROVIDER=visao
 *   OPENAI_API_KEY=...        (opcional se houver Gemini)
 *   GEMINI_API_KEY=...        (opcional se houver OpenAI)
 *   OCR_OPENAI_MODEL=gpt-4o-mini          (default)
 *   OCR_GEMINI_MODEL=gemini-2.0-flash     (default)
 */

const CATEGORIAS: CategoriaDespesa[] = [
  "combustivel",
  "alimentacao",
  "hospedagem",
  "pedagio",
  "uber",
  "taxi",
];

const PROMPT = `Você é um extrator de dados de cupons fiscais e notas fiscais brasileiras (NFC-e, NF-e, DANFE, cupom de maquininha NÃO é válido sozinho).
Analise a imagem e devolva SOMENTE um JSON com estas chaves (null quando não legível):
{
  "cnpjEmitente": string no formato "00.000.000/0000-00" ou null,
  "valor": número decimal com ponto (ex.: 90.14) — o VALOR TOTAL do documento — ou null,
  "dataFatoGerador": string ISO "yyyy-mm-dd" ou null,
  "litros": número (apenas para combustível; quantidade de litros) ou null,
  "categoriaSugerida": uma de ["combustivel","alimentacao","hospedagem","pedagio","uber","taxi"] ou null,
  "consumidorIdentificado": boolean — true se o documento traz CPF/CNPJ do consumidor,
  "resumoItens": string curta descrevendo os itens (ex.: "mercearia: pães, biscoitos, chá") ou null,
  "confianca": "alta" | "media" | "baixa"
}
Regras de categoria: posto/combustível → combustivel; restaurante/lanche/refeição → alimentacao; hotel/pousada → hospedagem; pedágio → pedagio; Uber/99 → uber; táxi → taxi. Compra de mercado/mercearia NÃO é alimentacao — nesses casos use null.
Não invente valores: se não estiver legível, use null.`;

type ExtracaoIA = {
  cnpjEmitente: string | null;
  valor: number | null;
  dataFatoGerador: string | null;
  litros: number | null;
  categoriaSugerida: CategoriaDespesa | null;
  consumidorIdentificado: boolean | null;
  resumoItens: string | null;
  confianca: "alta" | "media" | "baixa";
};

/** Normaliza o JSON cru da IA para o contrato — puro e testável. */
export function normalizarExtracaoIA(raw: unknown): ExtracaoIA {
  const o = (raw ?? {}) as Record<string, unknown>;

  const cnpj =
    typeof o.cnpjEmitente === "string"
      ? (o.cnpjEmitente.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/)?.[0] ?? null)
      : null;

  let valor: number | null = null;
  if (typeof o.valor === "number" && Number.isFinite(o.valor)) valor = o.valor;
  else if (typeof o.valor === "string") {
    const n = Number(o.valor.replace(/\./g, "").replace(",", "."));
    if (Number.isFinite(n)) valor = n;
  }
  if (valor != null && (valor <= 0 || valor > 1_000_000)) valor = null;

  let data: string | null = null;
  if (typeof o.dataFatoGerador === "string") {
    const iso = o.dataFatoGerador.match(/(\d{4})-(\d{2})-(\d{2})/);
    const br = o.dataFatoGerador.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (iso) data = `${iso[1]}-${iso[2]}-${iso[3]}`;
    else if (br) data = `${br[3]}-${br[2]}-${br[1]}`;
  }

  const litros =
    typeof o.litros === "number" && o.litros > 0 && o.litros < 10_000 ? o.litros : null;

  const categoria = CATEGORIAS.includes(o.categoriaSugerida as CategoriaDespesa)
    ? (o.categoriaSugerida as CategoriaDespesa)
    : null;

  const confianca =
    o.confianca === "alta" || o.confianca === "media" || o.confianca === "baixa"
      ? o.confianca
      : "baixa";

  return {
    cnpjEmitente: cnpj,
    valor,
    dataFatoGerador: data,
    litros,
    categoriaSugerida: categoria,
    consumidorIdentificado:
      typeof o.consumidorIdentificado === "boolean" ? o.consumidorIdentificado : null,
    resumoItens: typeof o.resumoItens === "string" ? o.resumoItens.slice(0, 255) : null,
    confianca,
  };
}

function extraiJsonDaResposta(texto: string): unknown {
  const limpo = texto.replace(/```json|```/g, "").trim();
  const inicio = limpo.indexOf("{");
  const fim = limpo.lastIndexOf("}");
  if (inicio === -1 || fim === -1) throw new Error("resposta sem JSON");
  return JSON.parse(limpo.slice(inicio, fim + 1));
}

async function chamarOpenAI(arquivo: ArquivoNota): Promise<ExtracaoIA> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY ausente");
  const model = process.env.OCR_OPENAI_MODEL ?? "gpt-4o-mini";

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: PROMPT },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:${arquivo.arquivoMime};base64,${arquivo.arquivoBase64}`,
                detail: "high",
              },
            },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI resposta vazia");
  return normalizarExtracaoIA(extraiJsonDaResposta(content));
}

async function chamarGemini(arquivo: ArquivoNota): Promise<ExtracaoIA> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY ausente");
  const model = process.env.OCR_GEMINI_MODEL ?? "gemini-2.0-flash";

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        generationConfig: { temperature: 0, responseMimeType: "application/json" },
        contents: [
          {
            role: "user",
            parts: [
              { text: PROMPT },
              {
                inline_data: {
                  mime_type: arquivo.arquivoMime,
                  data: arquivo.arquivoBase64,
                },
              },
            ],
          },
        ],
      }),
    },
  );
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const content = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) throw new Error("Gemini resposta vazia");
  return normalizarExtracaoIA(extraiJsonDaResposta(content));
}

export class VisaoOcrProvider implements OcrProvider {
  nome = "visao-ia";

  private fallbackTexto: OcrProvider;

  constructor(fallbackTexto: OcrProvider) {
    this.fallbackTexto = fallbackTexto;
  }

  async extrair(arquivo: ArquivoNota): Promise<OcrExtracao> {
    const isXml =
      arquivo.arquivoMime.includes("xml") ||
      arquivo.arquivoNome.toLowerCase().endsWith(".xml");
    const ehImagemOuPdf =
      arquivo.arquivoMime.startsWith("image/") || arquivo.arquivoMime.includes("pdf");

    // XML/texto: heurístico resolve de graça
    if (isXml || !ehImagemOuPdf) {
      return this.fallbackTexto.extrair(arquivo);
    }

    const tentativas: { nome: string; fn: () => Promise<ExtracaoIA> }[] = [
      { nome: "openai", fn: () => chamarOpenAI(arquivo) },
      { nome: "gemini", fn: () => chamarGemini(arquivo) },
    ];

    const erros: string[] = [];
    for (const t of tentativas) {
      try {
        const ia = await t.fn();
        const pendentes: string[] = [];
        if (!ia.cnpjEmitente) pendentes.push("cnpjEmitente");
        if (ia.valor == null) pendentes.push("valor");
        if (!ia.dataFatoGerador) pendentes.push("dataFatoGerador");
        if (!ia.categoriaSugerida) pendentes.push("categoria");
        const avisos: string[] = [];
        if (ia.consumidorIdentificado === false) {
          avisos.push("Consumidor NÃO identificado no documento (sem CPF/CNPJ).");
        }
        if (ia.resumoItens) avisos.push(`Itens: ${ia.resumoItens}`);
        return {
          cnpjEmitente: ia.cnpjEmitente,
          cfop: null,
          ncm: null,
          cst: null,
          valor: ia.valor,
          dataFatoGerador: ia.dataFatoGerador,
          litros: ia.litros,
          categoriaSugerida: ia.categoriaSugerida,
          confiancaExtracao: ia.confianca,
          camposPendentes: pendentes,
          provedor: `${this.nome}:${t.nome}`,
          avisos,
        };
      } catch (e) {
        erros.push(`${t.nome}: ${e instanceof Error ? e.message : "erro"}`);
      }
    }

    // Nunca trava o fluxo: sem leitura → revisão manual (D-014)
    return {
      cnpjEmitente: null,
      cfop: null,
      ncm: null,
      cst: null,
      valor: null,
      dataFatoGerador: null,
      litros: null,
      categoriaSugerida: null,
      confiancaExtracao: "baixa",
      camposPendentes: ["cnpjEmitente", "valor", "dataFatoGerador", "categoria"],
      provedor: this.nome,
      avisos: [
        `IA de visão indisponível (${erros.join("; ") || "sem chave configurada"}) — enviada para revisão manual.`,
      ],
    };
  }
}

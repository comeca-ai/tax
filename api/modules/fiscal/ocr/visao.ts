import { TIPOS_DOCUMENTO, type CategoriaDespesa, type OcrExtracao, type TipoDocumento } from "@contracts/types";
import type { ArquivoNota, OcrProvider } from "./index";

/**
 * Provider de OCR por IA de visão (v1.7.0) — D-014.
 *
 * Estratégia:
 *  - XML/texto continua no heurístico (rápido e grátis).
 *  - Imagem/PDF escaneado vai para IA de visão. Por padrão, Mistral OCR é
 *    tentado primeiro; OCR_VISION_PROVIDER=openai prioriza OpenAI.
 *  - NUNCA lança erro para cima: se nada conseguiu ler, devolve extração
 *    "baixa" com camposPendentes — o decisor manda para revisão manual.
 *    Ninguém preenche nada.
 *
 * Env:
 *   OCR_PROVIDER=visao
 *   MISTRAL_API_KEY=...       (opcional se houver OpenAI; mesma chave do parser de política)
 *   OPENAI_API_KEY=...        (opcional se houver Mistral)
 *   MISTRAL_OCR_MODEL=mistral-ocr-latest  (default; a MESMA variável do parser de política)
 *   OCR_OPENAI_MODEL=gpt-4o-mini          (default)
 *   OCR_VISION_PROVIDER=openai            (opcional; prioriza OpenAI)
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
  "cnpjDestinatario": string com 14 dígitos do CNPJ EXPLÍCITO do destinatário/consumidor ou null,
  "chaveAcesso": string com os 44 dígitos da chave de acesso inteiramente legível ou null,
  "valor": número decimal com ponto (ex.: 90.14) — o VALOR TOTAL do documento — ou null,
  "dataFatoGerador": string ISO "yyyy-mm-dd" ou null,
  "litros": número (apenas para combustível; quantidade de litros) ou null,
  "categoriaSugerida": uma de ["combustivel","alimentacao","hospedagem","pedagio","uber","taxi"] ou null,
  "consumidorIdentificado": boolean — true se o documento traz CPF/CNPJ do consumidor,
  "resumoItens": string curta descrevendo os itens (ex.: "mercearia: pães, biscoitos, chá") ou null,
  "confianca": "alta" | "media" | "baixa",
  "tipoDocumento": uma de ["nota_fiscal","recibo","extrato_conta","comprovante_pagamento","outro"],
  "confiancaTipo": "alta" | "media" | "baixa"
}
Regras de categoria: posto/combustível → combustivel; restaurante/lanche/refeição → alimentacao; hotel/pousada → hospedagem; pedágio → pedagio; Uber/99 → uber; táxi → taxi. Compra de mercado/mercearia NÃO é alimentacao — nesses casos use null.
Regras de tipoDocumento: cupom fiscal, NFC-e, NF-e, DANFE ou nota de serviço → nota_fiscal; recibo emitido pelo prestador → recibo; extrato bancário ou "extrato de conta" → extrato_conta; comprovante de Pix/TED/DOC/cartão/maquininha → comprovante_pagamento; qualquer outra coisa → outro. Use confiancaTipo "alta" SOMENTE quando o tipo é inequívoco; na dúvida, "media" ou "baixa". Não invente.
O CNPJ do emitente é o fornecedor; cnpjDestinatario é exclusivamente o CNPJ do comprador/destinatário identificado no documento. Não copie o emitente para o destinatário, não use CPF como CNPJ e não infira destinatário pelo cadastro da empresa. Consumidor identificado por CPF não fornece cnpjDestinatario.
Para chaveAcesso, transcreva todos os 44 dígitos legíveis; não complete por cálculo, não reconstrua dígitos, não confunda número da nota/protocolo/QR com chave. Dígito ausente ou duvidoso exige null para a chave inteira.
Não invente valores: se não estiver legível, use null.`;

type ExtracaoIA = {
  cnpjEmitente: string | null;
  cnpjDestinatario: string | null;
  chaveAcesso: string | null;
  valor: number | null;
  dataFatoGerador: string | null;
  litros: number | null;
  categoriaSugerida: CategoriaDespesa | null;
  consumidorIdentificado: boolean | null;
  resumoItens: string | null;
  confianca: "alta" | "media" | "baixa";
  tipoDocumento: TipoDocumento | null;
  confiancaTipo: "alta" | "media" | "baixa" | null;
};

/** Normaliza o JSON cru da IA para o contrato — puro e testável. */
export function normalizarExtracaoIA(raw: unknown): ExtracaoIA {
  const o = (raw ?? {}) as Record<string, unknown>;

  const cnpj =
    typeof o.cnpjEmitente === "string"
      ? (o.cnpjEmitente.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/)?.[0] ?? null)
      : null;
  const destinatario = typeof o.cnpjDestinatario === "string" && /^\s*(?:\d{14}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})\s*$/.test(o.cnpjDestinatario)
    ? o.cnpjDestinatario.replace(/\D/g, "") : null;
  const chave = typeof o.chaveAcesso === "string" && /^[\d\s]+$/.test(o.chaveAcesso)
    ? o.chaveAcesso.replace(/\s/g, "") : null;

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

  // Valor inválido → null (conservador: sem tipo, o decisor não muda nada)
  const tipoDocumento = TIPOS_DOCUMENTO.includes(o.tipoDocumento as TipoDocumento)
    ? (o.tipoDocumento as TipoDocumento)
    : null;
  const confiancaTipo =
    o.confiancaTipo === "alta" || o.confiancaTipo === "media" || o.confiancaTipo === "baixa"
      ? o.confiancaTipo
      : null;

  return {
    cnpjEmitente: cnpj,
    cnpjDestinatario: destinatario,
    chaveAcesso: chave?.length === 44 ? chave : null,
    valor,
    dataFatoGerador: data,
    litros,
    categoriaSugerida: categoria,
    consumidorIdentificado:
      typeof o.consumidorIdentificado === "boolean" ? o.consumidorIdentificado : null,
    resumoItens: typeof o.resumoItens === "string" ? o.resumoItens.slice(0, 255) : null,
    confianca,
    tipoDocumento,
    confiancaTipo,
  };
}

function extraiJsonDaResposta(texto: string): unknown {
  const limpo = texto.replace(/```json|```/g, "").trim();
  const inicio = limpo.indexOf("{");
  const fim = limpo.lastIndexOf("}");
  if (inicio === -1 || fim === -1) throw new Error("resposta sem JSON");
  return JSON.parse(limpo.slice(inicio, fim + 1));
}

/** A API pode expor o texto consolidado ou apenas o item de saída. */
class ErroProviderVisao extends Error {}

function textoRespostaOpenAI(resposta: unknown): string {
  const dados = resposta as {
    output_text?: unknown;
    output?: { content?: { type?: string; text?: string }[] }[];
  };
  if (typeof dados.output_text === "string" && dados.output_text.trim()) return dados.output_text;
  const texto = (dados.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("\n")
    .trim();
  if (texto) return texto;
  throw new ErroProviderVisao("resposta sem conteúdo utilizável");
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

/** Schema compartilhado Mistral/Responses: todos required; ausentes usam null.
 * https://developers.openai.com/api/docs/guides/structured-outputs
 */
const SCHEMA_ANNOTATION = {
  type: "object",
  additionalProperties: false,
  required: [
    "cnpjEmitente",
    "cnpjDestinatario",
    "chaveAcesso",
    "valor",
    "dataFatoGerador",
    "litros",
    "categoriaSugerida",
    "consumidorIdentificado",
    "resumoItens",
    "confianca",
    "tipoDocumento",
    "confiancaTipo",
  ],
  properties: {
    cnpjEmitente: {
      type: ["string", "null"],
      description: 'CNPJ do emitente no formato "00.000.000/0000-00"; null se não legível',
    },
    cnpjDestinatario: {
      type: ["string", "null"],
      description: "CNPJ do destinatário/comprador EXPLICITAMENTE impresso, com 14 dígitos. Não copiar emitente, inferir do cadastro nem usar CPF. Ausente ou ilegível: null.",
    },
    chaveAcesso: {
      type: ["string", "null"],
      description: "Chave de acesso completa de 44 dígitos legíveis. Não completar nem reconstruir dígitos; não confundir com número da nota ou protocolo. Qualquer dígito ausente/duvidoso: null.",
    },
    valor: {
      type: ["number", "null"],
      description: "VALOR TOTAL do documento, decimal com ponto (ex.: 90.14); null se não legível — não invente",
    },
    dataFatoGerador: {
      type: ["string", "null"],
      description: 'Data de emissão em ISO "yyyy-mm-dd"; null se não legível',
    },
    litros: {
      type: ["number", "null"],
      description: "Quantidade de litros (apenas combustível); null nos demais casos",
    },
    categoriaSugerida: {
      type: ["string", "null"],
      enum: [...CATEGORIAS, null],
      description:
        "posto/combustível → combustivel; restaurante/refeição → alimentacao; hotel/pousada → hospedagem; pedágio → pedagio; Uber/99 → uber; táxi → taxi. Mercado/mercearia NÃO é alimentacao — use null",
    },
    consumidorIdentificado: {
      type: ["boolean", "null"],
      description: "true se o documento traz CPF/CNPJ do consumidor",
    },
    resumoItens: {
      type: ["string", "null"],
      description: 'String curta descrevendo os itens (ex.: "mercearia: pães, biscoitos, chá"); null se não legível',
    },
    confianca: {
      type: "string",
      enum: ["alta", "media", "baixa"],
      description: "Confiança geral da extração dos campos",
    },
    tipoDocumento: {
      type: "string",
      enum: [...TIPOS_DOCUMENTO],
      description:
        'cupom fiscal/NFC-e/NF-e/DANFE/nota de serviço → nota_fiscal; recibo emitido pelo prestador → recibo; extrato bancário ou "extrato de conta" → extrato_conta; comprovante de Pix/TED/DOC/cartão/maquininha → comprovante_pagamento; qualquer outra coisa → outro',
    },
    confiancaTipo: {
      type: "string",
      enum: ["alta", "media", "baixa"],
      description: '"alta" SOMENTE quando o tipo é inequívoco; na dúvida, "media" ou "baixa". Não invente',
    },
  },
} as const;

/** document_annotation vem como string JSON (às vezes com cercas) ou objeto — parser defensivo. */
export function extrairAnnotationMistral(resposta: unknown): unknown {
  const o = (resposta ?? {}) as { document_annotation?: unknown };
  const a = o.document_annotation;
  if (a && typeof a === "object") return a;
  if (typeof a === "string" && a.trim()) return extraiJsonDaResposta(a); // já remove ```json
  throw new Error("Mistral OCR sem document_annotation na resposta");
}

async function chamarMistral(arquivo: ArquivoNota): Promise<ExtracaoIA> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) throw new ErroProviderVisao("credencial não configurada");
  // Mesma variável já lida por `policy/mistral.ts` — nada novo precisa entrar no .env do servidor.
  const model = process.env.MISTRAL_OCR_MODEL ?? "mistral-ocr-latest";

  const dataUri = `data:${arquivo.arquivoMime};base64,${arquivo.arquivoBase64}`;
  const document = arquivo.arquivoMime.startsWith("image/")
    ? { type: "image_url", image_url: dataUri }
    : { type: "document_url", document_url: dataUri };

  const res = await comTimeout(
    (signal) =>
      fetch("https://api.mistral.ai/v1/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          document,
          include_image_base64: false,
          document_annotation_format: {
            type: "json_schema",
            json_schema: { name: "extracao_nota", schema: SCHEMA_ANNOTATION },
          },
        }),
        signal,
      }),
    60_000,
  );
  if (!res.ok) {
    throw new ErroProviderVisao(`HTTP ${res.status}`);
  }
  const json = (await res.json()) as unknown;
  return normalizarExtracaoIA(extrairAnnotationMistral(json));
}

async function chamarOpenAI(arquivo: ArquivoNota): Promise<ExtracaoIA> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new ErroProviderVisao("credencial não configurada");
  const model = process.env.OCR_OPENAI_MODEL ?? "gpt-4o-mini";

  const res = await comTimeout(
    (signal) =>
      fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          store: false,
          max_output_tokens: 2_000,
          text: {
            format: {
              type: "json_schema",
              name: "extracao_nota",
              strict: true,
              schema: SCHEMA_ANNOTATION,
            },
          },
          input: [
            { role: "developer", content: [{ type: "input_text", text: PROMPT }] },
            {
              role: "user",
              content: [
                arquivo.arquivoMime.startsWith("image/")
                  ? {
                      type: "input_image",
                      image_url: `data:${arquivo.arquivoMime};base64,${arquivo.arquivoBase64}`,
                      detail: "high",
                    }
                  : {
                      type: "input_file",
                      filename: arquivo.arquivoNome,
                      file_data: `data:${arquivo.arquivoMime};base64,${arquivo.arquivoBase64}`,
                    },
              ],
            },
          ],
        }),
        signal,
      }),
    60_000,
  );
  if (!res.ok) {
    throw new ErroProviderVisao(`HTTP ${res.status}`);
  }
  return normalizarExtracaoIA(extraiJsonDaResposta(textoRespostaOpenAI(await res.json())));
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

    const tentativasPadrao: { nome: string; fn: () => Promise<ExtracaoIA> }[] = [
      { nome: "mistral", fn: () => chamarMistral(arquivo) },
      { nome: "openai", fn: () => chamarOpenAI(arquivo) },
    ];
    const tentativas = process.env.OCR_VISION_PROVIDER === "openai"
      ? [...tentativasPadrao].reverse()
      : tentativasPadrao;

    const erros: string[] = [];
    for (const t of tentativas) {
      try {
        const ia = await t.fn();
        const pendentes: string[] = [];
        if (!ia.cnpjEmitente) pendentes.push("cnpjEmitente");
        if (ia.valor == null) pendentes.push("valor");
        if (!ia.dataFatoGerador) pendentes.push("dataFatoGerador");
        if (!ia.categoriaSugerida) pendentes.push("categoria");
        if (ia.categoriaSugerida === "combustivel") {
          if (!ia.cnpjDestinatario) pendentes.push("cnpjDestinatario");
          if (!ia.chaveAcesso) pendentes.push("chaveAcesso");
          if (ia.litros === null) pendentes.push("litros");
        }
        const avisos: string[] = [];
        if (ia.consumidorIdentificado === false) {
          avisos.push("Consumidor NÃO identificado no documento (sem CPF/CNPJ).");
        }
        if (ia.resumoItens) avisos.push(`Itens: ${ia.resumoItens}`);
        return {
          cnpjEmitente: ia.cnpjEmitente,
          cnpjDestinatario: ia.cnpjDestinatario,
          chaveAcesso: ia.chaveAcesso,
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
          tipoDocumento: ia.tipoDocumento,
          confiancaTipo: ia.confiancaTipo,
        };
      } catch (e) {
        erros.push(`${t.nome}: ${e instanceof ErroProviderVisao ? e.message : "falha de transporte ou resposta inválida"}`);
      }
    }

    // Nunca trava o fluxo: sem leitura → revisão manual (D-014)
    return {
      cnpjEmitente: null,
      cnpjDestinatario: null,
      chaveAcesso: null,
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
      tipoDocumento: null,
      confiancaTipo: null,
    };
  }
}

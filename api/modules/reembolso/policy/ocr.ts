// Import direto da lib, pelo mesmo motivo de parser.ts (bloco de debug no index.js).
// @ts-expect-error — pdf-parse v1 não tem tipos para o subpath da lib
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import type { ArquivoPolitica } from "./parser";

/**
 * Pré-passo de texto do upload da política, antes de qualquer LLM:
 *
 *   ① pdf-parse (texto nativo, grátis)  → PDF com camada de texto
 *   ② PaddleOCR (microserviço próprio)   → escaneado/foto, se POLICY_OCR_URL existir
 *   ③ nada                               → o parser faz o próprio OCR (Mistral OCR pago)
 *
 * Quando ① ou ② rendem texto, o arquivo volta como `text/plain`: os três
 * parsers já tratam `text/*` sem OCR (Mistral vai direto ao chat, OpenAI manda
 * `input_text`, heurístico decodifica). Nenhum parser precisa saber que o
 * Paddle existe — ele é só HTTP, nunca importado aqui.
 */

export type OrigemTexto = "nativo" | "paddle";

export type TextoPreparado = {
  input: ArquivoPolitica;
  origem: OrigemTexto | null;
  avisos: string[];
};

/** Abaixo disto por página, o "texto nativo" é lixo de capa/rodapé: trate como escaneado. */
export const MIN_CHARS_POR_PAGINA = 200;

const TIMEOUT_PADRAO_MS = 120_000;

function comoTexto(input: ArquivoPolitica, texto: string): ArquivoPolitica {
  return {
    arquivoNome: input.arquivoNome,
    mimeType: "text/plain",
    base64: Buffer.from(texto, "utf8").toString("base64"),
  };
}

async function textoNativoPdf(base64: string): Promise<{ texto: string; paginas: number } | null> {
  try {
    const dados = (await pdfParse(Buffer.from(base64, "base64"))) as { text?: string; numpages?: number };
    const texto = (dados.text ?? "").replace(/\r/g, "").trim();
    const paginas = Math.max(1, dados.numpages ?? 1);
    if (texto.length < MIN_CHARS_POR_PAGINA * paginas) return null;
    return { texto, paginas };
  } catch {
    return null; // corrompido, criptografado ou não é PDF de verdade → OCR
  }
}

type RespostaOcr = { texto?: unknown; paginas?: unknown; segundos?: unknown; motor?: unknown };

async function ocrLocal(url: string, input: ArquivoPolitica) {
  const token = process.env.POLICY_OCR_TOKEN;
  const timeoutMs = Number(process.env.POLICY_OCR_TIMEOUT_MS ?? TIMEOUT_PADRAO_MS);
  const resposta = await fetch(`${url.replace(/\/+$/, "")}/ocr`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      arquivoNome: input.arquivoNome,
      mimeType: input.mimeType,
      base64: input.base64,
    }),
    signal: AbortSignal.timeout(Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : TIMEOUT_PADRAO_MS),
  });
  if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
  const dados = (await resposta.json()) as RespostaOcr;
  const texto = typeof dados.texto === "string" ? dados.texto.trim() : "";
  if (!texto) throw new Error("texto vazio");
  return {
    texto,
    paginas: Array.isArray(dados.paginas) ? dados.paginas.length : 0,
    segundos: typeof dados.segundos === "number" ? dados.segundos : null,
    motor: typeof dados.motor === "string" ? dados.motor : "paddleocr",
  };
}

export async function prepararTexto(input: ArquivoPolitica): Promise<TextoPreparado> {
  const mime = (input.mimeType || "").toLowerCase();
  if (mime.startsWith("text/")) return { input, origem: null, avisos: [] };

  const ehPdf = mime.includes("pdf") || /\.pdf$/i.test(input.arquivoNome);
  if (ehPdf) {
    const nativo = await textoNativoPdf(input.base64);
    if (nativo) {
      return {
        input: comoTexto(input, nativo.texto),
        origem: "nativo",
        avisos: [`Texto nativo do PDF (${nativo.paginas} página(s)); nenhum OCR foi necessário.`],
      };
    }
  }

  const url = process.env.POLICY_OCR_URL;
  if (!url) return { input, origem: null, avisos: [] };

  try {
    const r = await ocrLocal(url, input);
    const tempo = r.segundos === null ? "" : `, ${r.segundos}s`;
    return {
      input: comoTexto(input, r.texto),
      origem: "paddle",
      avisos: [`OCR local (${r.motor}, ${r.paginas} página(s)${tempo}).`],
    };
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : String(erro);
    // Fallback acordado: o upload não trava; o parser usa o OCR pago do provedor.
    return {
      input,
      origem: null,
      avisos: [`OCR local indisponível (${motivo}): OCR do provedor de IA usado no lugar.`],
    };
  }
}

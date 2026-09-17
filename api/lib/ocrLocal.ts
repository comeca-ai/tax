// Import direto da lib, pelo mesmo motivo de parser.ts (bloco de debug no index.js).
// @ts-expect-error — pdf-parse v1 não tem tipos para o subpath da lib
import pdfParse from "pdf-parse/lib/pdf-parse.js";

/**
 * Texto local de um documento, antes de qualquer IA paga:
 *
 *   ① pdf-parse (texto nativo, grátis)  → PDF com camada de texto
 *   ② PaddleOCR (microserviço próprio)   → escaneado/foto, se a URL existir
 *   ③ nada                               → quem chamou decide (OCR pago, revisão…)
 *
 * Usado pela política (`policy/ocr.ts`) e pelo comprovante fiscal
 * (`fiscal/ocr/visao.ts`). O Paddle nunca é importado: é HTTP interno com
 * token, então trocá-lo por outro motor não toca em nenhum dos dois.
 *
 * Env (as `POLICY_*` são aceitas como alias para não quebrar quem já
 * configurou a política antes deste módulo existir):
 *   OCR_LOCAL_URL | POLICY_OCR_URL              vazio = pré-passo desligado
 *   OCR_LOCAL_TOKEN | POLICY_OCR_TOKEN
 *   OCR_LOCAL_TIMEOUT_MS | POLICY_OCR_TIMEOUT_MS
 */

export type ArquivoBinario = {
  nome: string;
  mimeType: string;
  base64: string;
};

export type OrigemTexto = "nativo" | "paddle";

export type TextoLocal = {
  texto: string;
  origem: OrigemTexto;
  /** Frase pronta para o usuário: nomeia quem leu o documento. */
  aviso: string;
};

export type ResultadoTextoLocal = {
  /** null = não houve texto local; quem chamou segue para o caminho pago. */
  texto: TextoLocal | null;
  avisos: string[];
};

/** Abaixo disto por página, o "texto nativo" é lixo de capa/rodapé: trate como escaneado. */
export const MIN_CHARS_POR_PAGINA = 200;

const TIMEOUT_PADRAO_MS = 120_000;

function urlSidecar() {
  return process.env.OCR_LOCAL_URL ?? process.env.POLICY_OCR_URL;
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

async function ocrLocal(url: string, arquivo: ArquivoBinario) {
  const token = process.env.OCR_LOCAL_TOKEN ?? process.env.POLICY_OCR_TOKEN;
  const timeoutMs = Number(
    process.env.OCR_LOCAL_TIMEOUT_MS ?? process.env.POLICY_OCR_TIMEOUT_MS ?? TIMEOUT_PADRAO_MS
  );
  const resposta = await fetch(`${url.replace(/\/+$/, "")}/ocr`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      arquivoNome: arquivo.nome,
      mimeType: arquivo.mimeType,
      base64: arquivo.base64,
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

export async function extrairTextoLocal(arquivo: ArquivoBinario): Promise<ResultadoTextoLocal> {
  const mime = (arquivo.mimeType || "").toLowerCase();
  if (mime.startsWith("text/")) return { texto: null, avisos: [] };

  const ehPdf = mime.includes("pdf") || /\.pdf$/i.test(arquivo.nome);
  if (ehPdf) {
    const nativo = await textoNativoPdf(arquivo.base64);
    if (nativo) {
      return {
        texto: {
          texto: nativo.texto,
          origem: "nativo",
          aviso: `Texto nativo do PDF (${nativo.paginas} página(s)); nenhum OCR foi necessário.`,
        },
        avisos: [],
      };
    }
  }

  const url = urlSidecar();
  if (!url) return { texto: null, avisos: [] };

  try {
    const r = await ocrLocal(url, arquivo);
    const tempo = r.segundos === null ? "" : `, ${r.segundos}s`;
    return {
      texto: {
        texto: r.texto,
        origem: "paddle",
        aviso: `OCR local (${r.motor}, ${r.paginas} página(s)${tempo}).`,
      },
      avisos: [],
    };
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : String(erro);
    // Fallback acordado: nada trava; quem chamou segue para o caminho pago.
    return {
      texto: null,
      avisos: [`OCR local indisponível (${motivo}): OCR do provedor de IA usado no lugar.`],
    };
  }
}

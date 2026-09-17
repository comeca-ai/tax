import { extrairTextoLocal, MIN_CHARS_POR_PAGINA, type OrigemTexto } from "../../../lib/ocrLocal";
import type { ArquivoPolitica } from "./parser";

/**
 * Pré-passo de texto do upload da política, antes de qualquer LLM. A leitura
 * local (texto nativo do PDF → PaddleOCR) mora em `lib/ocrLocal`, compartilhada
 * com o OCR de comprovantes; aqui fica só a tradução para `ArquivoPolitica`:
 *
 *   ① texto local encontrado → o arquivo vira `text/plain`
 *   ② nada                    → o parser faz o próprio OCR (Mistral OCR pago)
 *
 * Com `text/plain` os três parsers pulam o OCR (Mistral vai direto ao chat,
 * OpenAI manda `input_text`, heurístico decodifica). Nenhum parser precisa
 * saber que o Paddle existe.
 */

export type { OrigemTexto };
export { MIN_CHARS_POR_PAGINA };

export type TextoPreparado = {
  input: ArquivoPolitica;
  origem: OrigemTexto | null;
  avisos: string[];
};

function comoTexto(input: ArquivoPolitica, texto: string): ArquivoPolitica {
  return {
    arquivoNome: input.arquivoNome,
    mimeType: "text/plain",
    base64: Buffer.from(texto, "utf8").toString("base64"),
    // Guarda o binário: o OCR anotado da Mistral precisa do documento, não do texto.
    original: {
      arquivoNome: input.arquivoNome,
      mimeType: input.mimeType,
      base64: input.base64,
    },
  };
}

export async function prepararTexto(input: ArquivoPolitica): Promise<TextoPreparado> {
  const local = await extrairTextoLocal({
    nome: input.arquivoNome,
    mimeType: input.mimeType,
    base64: input.base64,
  });
  if (!local.texto) return { input, origem: null, avisos: local.avisos };
  return {
    input: comoTexto(input, local.texto.texto),
    origem: local.texto.origem,
    avisos: [local.texto.aviso],
  };
}

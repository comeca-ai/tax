/**
 * Limite de `politicasReembolso.textoExtraido` (coluna MySQL TEXT = 65 535 bytes).
 * Truncamos por bytes UTF-8, não por caracteres, para o INSERT nunca estourar
 * a coluna em modo estrito com texto acentuado.
 */
export const LIMITE_TEXTO_EXTRAIDO_BYTES = 65_000;

/** Corta `texto` para caber em `maxBytes` UTF-8 sem partir um caractere. */
export function truncarUtf8(texto: string, maxBytes: number): string {
  if (maxBytes <= 0) return "";
  const buf = Buffer.from(texto, "utf8");
  if (buf.byteLength <= maxBytes) return texto;
  let fim = maxBytes;
  // recua enquanto o byte em `fim` for continuação (10xxxxxx)
  while (fim > 0 && (buf[fim] & 0xc0) === 0x80) fim--;
  return buf.subarray(0, fim).toString("utf8");
}

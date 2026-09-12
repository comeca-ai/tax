/** Limite alinhado ao upload existente do painel; o webhook nunca recebe mídia sem limite. */
export const LIMITE_COMPROVANTE_BYTES = 10 * 1024 * 1024;

const MIMES_PERMITIDOS = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export type ComprovanteValidado = {
  arquivoNome: string;
  arquivoMime: "application/pdf" | "image/jpeg" | "image/png" | "image/webp";
  conteudo: Buffer;
};

function temPrefixo(conteudo: Buffer, bytes: number[]): boolean {
  return bytes.every((byte, indice) => conteudo[indice] === byte);
}

function mimeConfereComAssinatura(mime: string, conteudo: Buffer): boolean {
  if (mime === "application/pdf") return temPrefixo(conteudo, [0x25, 0x50, 0x44, 0x46, 0x2d]);
  if (mime === "image/jpeg") return temPrefixo(conteudo, [0xff, 0xd8, 0xff]);
  if (mime === "image/png") return temPrefixo(conteudo, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return (
    temPrefixo(conteudo, [0x52, 0x49, 0x46, 0x46]) &&
    conteudo.length >= 12 &&
    conteudo.subarray(8, 12).toString("ascii") === "WEBP"
  );
}

function nomeSeguro(nome: string): string | null {
  const limpo = nome.trim();
  if (!limpo || limpo.length > 255 || /[\0-\x1f\\/]/.test(limpo)) return null;
  return limpo;
}

/**
 * Valida o arquivo antes de OCR ou persistência. O MIME vindo do provider é
 * tratado como dado não confiável e precisa coincidir com a assinatura binária.
 */
export function validarComprovanteWhatsapp(input: {
  arquivoNome: string;
  arquivoMime: string;
  conteudo: Buffer;
}): { ok: true; comprovante: ComprovanteValidado } | { ok: false; erro: string } {
  const nome = nomeSeguro(input.arquivoNome);
  if (!nome) return { ok: false, erro: "Nome de arquivo inválido." };
  if (!MIMES_PERMITIDOS.has(input.arquivoMime)) {
    return { ok: false, erro: "Envie um PDF, JPG, PNG ou WEBP." };
  }
  if (input.conteudo.length === 0 || input.conteudo.length > LIMITE_COMPROVANTE_BYTES) {
    return { ok: false, erro: "O comprovante deve ter até 10 MB." };
  }
  if (!mimeConfereComAssinatura(input.arquivoMime, input.conteudo)) {
    return { ok: false, erro: "O conteúdo não corresponde ao tipo de arquivo informado." };
  }

  return {
    ok: true,
    comprovante: {
      arquivoNome: nome,
      arquivoMime: input.arquivoMime as ComprovanteValidado["arquivoMime"],
      conteudo: input.conteudo,
    },
  };
}

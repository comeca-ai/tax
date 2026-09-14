import { createHash } from "node:crypto";
import { chaveFiscalValida } from "../../reembolso/campo/dominio";

export function identidadeFiscalDoUpload(
  arquivoBase64: string,
  chaveExtraida?: string | null
) {
  const arquivo = Buffer.from(arquivoBase64, "base64");
  const chave =
    typeof chaveExtraida === "string" ? chaveExtraida.replace(/\s/g, "") : null;
  const valida = !!chave && chaveFiscalValida(chave);
  return {
    hash: createHash("sha256").update(arquivo).digest("hex"),
    tamanho: arquivo.length,
    chave: valida ? chave : null,
    chaveEstado: valida ? "valida" : chave ? "invalida" : "ausente",
  };
}

export function integridadeFiscalConfere(
  arquivoBase64: string | null,
  hashNota: string | null,
  hashDocumento: string
) {
  return (
    !!arquivoBase64 &&
    !!hashNota &&
    hashNota === hashDocumento &&
    createHash("sha256")
      .update(Buffer.from(arquivoBase64, "base64"))
      .digest("hex") === hashDocumento
  );
}

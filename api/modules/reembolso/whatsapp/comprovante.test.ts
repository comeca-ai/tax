import { describe, expect, it } from "vitest";
import {
  LIMITE_COMPROVANTE_BYTES,
  validarComprovanteWhatsapp,
} from "./comprovante";

function validar(
  arquivoMime: string,
  conteudo: Buffer,
  arquivoNome = "nota.pdf"
) {
  return validarComprovanteWhatsapp({ arquivoMime, conteudo, arquivoNome });
}

describe("validação de comprovante recebido por WhatsApp", () => {
  it("aceita PDF e imagens somente quando MIME e assinatura coincidem", () => {
    expect(
      validar("application/pdf", Buffer.from("%PDF-1.7\nconteudo"))
    ).toMatchObject({ ok: true });
    expect(
      validar("image/jpeg", Buffer.from([0xff, 0xd8, 0xff, 0x00]))
    ).toMatchObject({ ok: true });
    expect(
      validar(
        "image/png",
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      )
    ).toMatchObject({ ok: true });
    expect(
      validar("image/webp", Buffer.from("RIFF____WEBPVP8 "))
    ).toMatchObject({ ok: true });
  });

  it("recusa MIME não permitido, conteúdo disfarçado, nome perigoso e arquivo grande", () => {
    expect(validar("text/plain", Buffer.from("texto"))).toEqual({
      ok: false,
      erro: "Envie um PDF, JPG, PNG, WEBP ou XML de NF-e.",
    });
    expect(validar("application/pdf", Buffer.from("<script>"))).toEqual({
      ok: false,
      erro: "O conteúdo não corresponde ao tipo de arquivo informado.",
    });
    expect(
      validar("application/pdf", Buffer.from("%PDF-"), "../segredo.pdf")
    ).toEqual({ ok: false, erro: "Nome de arquivo inválido." });
    expect(
      validar("application/pdf", Buffer.alloc(LIMITE_COMPROVANTE_BYTES + 1, 0))
    ).toEqual({ ok: false, erro: "O comprovante deve ter até 10 MB." });
  });
});

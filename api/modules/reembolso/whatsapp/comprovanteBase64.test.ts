import { describe, expect, it } from "vitest";
import {
  decodificarComprovanteBase64,
  LIMITE_COMPROVANTE_BYTES,
  validarComprovanteBase64,
} from "./comprovante";

const validar = (
  arquivoMime: string,
  arquivoBase64: string,
  arquivoNome = "nota"
) => validarComprovanteBase64({ arquivoNome, arquivoMime, arquivoBase64 });

describe("validação base64 compartilhada", () => {
  it("recusa base64 inválido antes de OCR ou persistência", () => {
    expect(validar("image/png", "%%%", "nota.png")).toEqual({
      ok: false,
      erro: "O conteúdo do arquivo é inválido.",
    });
  });

  it("exige assinatura compatível e aceita XML fiscal textual", () => {
    expect(
      validar(
        "image/png",
        Buffer.from("sem imagem").toString("base64"),
        "nota.png"
      )
    ).toMatchObject({ ok: false });
    expect(
      validar(
        "application/xml",
        Buffer.from('<?xml version="1.0"?><NFe><infNFe /></NFe>').toString(
          "base64"
        ),
        "nota.xml"
      )
    ).toMatchObject({ ok: true });
  });

  it.each(["Zg", "Zg=", "Zh==", "Zm9=", "Zg==\n", "Zm=9", "===="])(
    "recusa base64 não canônico: %s",
    base64 => {
      expect(decodificarComprovanteBase64(base64)).toBeNull();
    }
  );

  it("aceita arquivo de 10 MB sem regex recursiva/estouro de pilha", () => {
    const conteudo = Buffer.alloc(LIMITE_COMPROVANTE_BYTES, 0);
    conteudo.write("%PDF-1.7\n");
    expect(
      validar("application/pdf", conteudo.toString("base64"), "nota.pdf").ok
    ).toBe(true);
  });

  it("recusa tamanho codificado acima do limite antes do decode", () => {
    expect(
      decodificarComprovanteBase64(
        "A".repeat(Math.ceil(LIMITE_COMPROVANTE_BYTES / 3) * 4 + 4)
      )
    ).toBeNull();
    expect(
      decodificarComprovanteBase64(
        Buffer.alloc(LIMITE_COMPROVANTE_BYTES + 1).toString("base64")
      )
    ).toBeNull();
  });
});

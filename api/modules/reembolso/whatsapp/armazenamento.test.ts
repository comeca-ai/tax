import { describe, expect, it } from "vitest";
import { prepararComprovanteParaBanco } from "./armazenamento";

describe("armazenamento temporário de comprovante", () => {
  it("mantém binário privado e metadados verificáveis para migração futura", () => {
    const conteudo = Buffer.from("%PDF-1.7\ncomprovante");
    const resultado = prepararComprovanteParaBanco({
      arquivoNome: "nota.pdf",
      arquivoMime: "application/pdf",
      conteudo,
    });

    expect(resultado).toMatchObject({
      arquivoBase64: conteudo.toString("base64"),
      arquivoStorageProvider: "database",
      arquivoStorageKey: null,
      arquivoTamanhoBytes: conteudo.length,
    });
    expect(resultado.arquivoChecksum).toMatch(/^[a-f0-9]{64}$/);
  });
});

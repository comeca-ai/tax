import { describe, expect, it } from "vitest";
import { HeuristicOcrProvider } from "./index";
import { extrairIdentidadeFiscalTexto } from "./identidadeTexto";
import { identidadeFiscalDoUpload } from "../verificacao/documento";

function chave(modelo = "55", numero = "000000007") {
  const base = `35260914200166000166${modelo}001${numero}100000000`;
  const soma = [...base].reverse().reduce((s, d, i) => s + Number(d) * (2 + i % 8), 0);
  const dv = 11 - soma % 11;
  return base + (dv >= 10 ? 0 : dv);
}
function arquivo(texto: string, mime = "application/xml") {
  return { arquivoNome: mime.endsWith("xml") ? "sintetico.xml" : "sintetico.txt", arquivoMime: mime, arquivoBase64: Buffer.from(texto).toString("base64") };
}

describe("identidade fiscal em XML/texto sem consulta externa", () => {
  it.each(["55", "65"])("preserva a chave do modelo %s até a persistência e o destinatário explícito", async modelo => {
    const key = chave(modelo);
    const input = arquivo(`<nfeProc><NFe><infNFe Id="NFe${key}"><emit><CNPJ>14200166000166</CNPJ></emit><dest><CNPJ>12345678000123</CNPJ></dest><total><vNF>25.00</vNF></total></infNFe></NFe><protNFe><infProt><chNFe>${key}</chNFe></infProt></protNFe></nfeProc>`);
    const extracao = await new HeuristicOcrProvider().extrair(input);
    expect(extracao).toMatchObject({ cnpjEmitente: "14200166000166", cnpjDestinatario: "12345678000123", chaveAcesso: key, valor: 25 });
    expect(identidadeFiscalDoUpload(input.arquivoBase64, extracao.chaveAcesso)).toMatchObject({ chave: key, chaveEstado: "valida" });
  });
  it("aceita namespace e espaços XML sem transformar CPF em CNPJ", async () => {
    const r = await new HeuristicOcrProvider().extrair(arquivo(`<n:NFe><n:infNFe Id = 'NFe${chave()}'><n:emit><n:CNPJ>14200166000166</n:CNPJ></n:emit><n:dest><n:CPF>12345678900</n:CPF></n:dest></n:infNFe></n:NFe>`));
    expect(r.chaveAcesso).toBe(chave());
    expect(r.cnpjDestinatario).toBeNull();
  });
  it("não copia CNPJ do emitente quando o destinatário está ausente", () => {
    expect(extrairIdentidadeFiscalTexto(`<NFe><infNFe Id="NFe${chave()}"><emit><CNPJ>14200166000166</CNPJ></emit></infNFe></NFe>`).cnpjDestinatario).toBeNull();
  });
  it("transcreve chave agrupada com rótulo de acesso em texto DANFE", async () => {
    const texto = `DANFE\nChave de acesso:\n${chave().match(/.{4}/g)!.join(" ")}\nValor total R$ 25,00`;
    const r = await new HeuristicOcrProvider().extrair(arquivo(texto, "text/plain"));
    expect(r.chaveAcesso).toBe(chave());
  });
  it("não aceita chaves divergentes no corpo e no protocolo XML", async () => {
    const r = await new HeuristicOcrProvider().extrair(arquivo(`<nfeProc><NFe><infNFe Id="NFe${chave()}"/></NFe><protNFe><chNFe>${chave("55", "000000008")}</chNFe></protNFe></nfeProc>`));
    expect(r.chaveAcesso).toBeNull();
    expect(r.avisos.join(" ")).toContain("chaves fiscais diferentes");
  });
  it.each(["1".repeat(43), "1".repeat(45), `${"1111 ".repeat(12)}`, "123456789012345", "ABC"]) ("não completa chave parcial ou sequência extensa: %s", candidata => {
    expect(extrairIdentidadeFiscalTexto(`Chave de acesso: ${candidata}`).chaveAcesso).toBeNull();
  });
  it("não promove código de verificação de NFS-e, protocolo ou ticket a chave NF-e", () => {
    expect(extrairIdentidadeFiscalTexto(`NFS-e\nCódigo de verificação: ABCD1234\nProtocolo ${chave()}\nTicket 008600`).chaveAcesso).toBeNull();
  });
  it("mantém dígito transcrito inválido para a camada fiscal explicar o erro, sem recalculá-lo", async () => {
    const invalida = chave().slice(0, -1) + ((Number(chave().at(-1)) + 1) % 10);
    const input = arquivo(`<NFe><infNFe Id="NFe${invalida}"/></NFe>`);
    const r = await new HeuristicOcrProvider().extrair(input);
    expect(r.chaveAcesso).toBe(invalida);
    expect(identidadeFiscalDoUpload(input.arquivoBase64, r.chaveAcesso)).toMatchObject({ chave: null, chaveEstado: "invalida" });
  });
});

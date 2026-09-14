import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
vi.mock("../../../queries/connection", () => ({ getDb: () => { throw new Error("Este teste não deve acessar banco."); } }));
import { extratorLocalCombustivel, prepararDocumentoExtraido, type ExtracaoCombustivel } from "./documentos";
import { chaveFiscalValida } from "./dominio";
import { podeAgendarLembrete } from "./lembretes";
import type { Conciliacao } from "./dominio";
import type { ConfiguracaoCampo } from "./politica";

const cnpj = "12345678000123";
const contexto = { cnpj, notaFiscalId: 8, veiculo: "ABC1D23" };
const base = "35260912345678000123550010000000011000000001".slice(0, 43);
const chave = Array.from({ length: 10 }, (_, i) => base + i).find(chaveFiscalValida)!;

describe("documento combustível extraído do binário", () => {
  it("XML fornece destinatário correto e soma somente combustível em litros", async () => {
    const xml = `<NFe><infNFe Id="NFe${chave}"><ide><dhEmi>2026-09-13T10:00:00-03:00</dhEmi></ide><emit><CNPJ>98765432000199</CNPJ></emit><dest><CNPJ>${cnpj}</CNPJ></dest><det nItem="1"><prod><NCM>27101921</NCM><uCom>L</uCom><qCom>20.5</qCom></prod></det><det nItem="2"><prod><NCM>22071090</NCM><uCom>LT</uCom><qCom>10</qCom></prod></det><det nItem="3"><prod><NCM>12345678</NCM><uCom>UN</uCom><qCom>7</qCom></prod></det></infNFe></NFe>`;
    const binario = Buffer.from(xml);
    const extraido = await extratorLocalCombustivel.extrair({ arquivoNome: "nota.xml", arquivoMime: "application/xml", arquivoBase64: binario.toString("base64") });
    const documento = prepararDocumentoExtraido(binario, extraido, contexto);
    expect(documento).toMatchObject({ chave, cnpjDestinatario: cnpj, litros: 30.5, estado: "em_validacao", notaFiscalId: 8, camposPendentes: [] });
    expect(documento.hash).toBe(createHash("sha256").update(binario).digest("hex"));
    expect(documento.estado).not.toBe("regular");
  });
  it("ausência OCR imagem permanece nula, não fabrica CNPJ/data/litros", async () => {
    const binario = Buffer.from("image");
    const ocr = await extratorLocalCombustivel.extrair({ arquivoNome: "n.png", arquivoMime: "image/png", arquivoBase64: binario.toString("base64") });
    expect(prepararDocumentoExtraido(binario, ocr, contexto)).toMatchObject({ chave: null, cnpjDestinatario: null, litros: null, data: null, estado: "em_validacao" });
  });
  it("não expande entidades XML nem presume documento autêntico", async () => {
    const xml = '<!DOCTYPE NFe [<!ENTITY x SYSTEM "file:///etc/passwd">]><NFe>&x;</NFe>';
    const r = await extratorLocalCombustivel.extrair({ arquivoNome: "n.xml", arquivoMime: "text/xml", arquivoBase64: Buffer.from(xml).toString("base64") });
    expect(r.camposPendentes).toContain("extracaoDocumento");
  });
  it("destinatário divergente não regulariza e checksum muda com conteúdo", () => {
    const ocr: ExtracaoCombustivel = { cnpjEmitente: null, cfop: null, ncm: null, cst: null, valor: null, dataFatoGerador: null, litros: null, categoriaSugerida: null, confiancaExtracao: "baixa", camposPendentes: [], provedor: "fixture", avisos: [], cnpjDestinatario: "99999999000199" };
    const a = prepararDocumentoExtraido(Buffer.from("a"), ocr, contexto);
    const b = prepararDocumentoExtraido(Buffer.from("b"), ocr, contexto);
    expect(a.estado).toBe("divergente"); expect(a.hash).not.toBe(b.hash);
  });
});

describe("janela e limites de lembretes", () => {
  const c: Conciliacao = { inicio: "2026-09-01T00:00:00Z", fim: "2026-09-10T00:00:00Z", veiculo: "ABC1D23", estado: "documentacao_pendente", metrosEstimados: 1000, litrosDocumentados: 0, litrosEsperados: 1, jornadas: ["j"], documentos: [], lembrete: "pendente", versao: 1 };
  const config = { limiteLembretes: 2, prazoNotaDias: 1, intervaloLembreteDias: 1 } as ConfiguracaoCampo;
  const agora = new Date("2026-09-13T12:00:00Z");
  const recente = "2026-09-13T11:00:00Z";
  it("respeita limite, intervalo, prazo e regularização", () => {
    expect(podeAgendarLembrete(c, config, recente, agora)).toBe(true);
    expect(podeAgendarLembrete({ ...c, estado: "conciliado", lembrete: "cancelado" }, config, recente, agora)).toBe(false);
    expect(podeAgendarLembrete({ ...c, lembretes: { agendados: 2, ultimoEm: recente, referencias: [] } }, config, recente, agora)).toBe(false);
    expect(podeAgendarLembrete({ ...c, lembretes: { agendados: 1, ultimoEm: recente, referencias: [] } }, config, recente, agora)).toBe(false);
    expect(podeAgendarLembrete(c, { ...config, prazoNotaDias: 10 }, recente, agora)).toBe(false);
  });
  it("não usa agora para reabrir janela fechada nem data futura", () => {
    expect(podeAgendarLembrete(c, config, undefined, agora)).toBe(false);
    expect(podeAgendarLembrete(c, config, "2026-09-12T12:00:00Z", agora)).toBe(false);
    expect(podeAgendarLembrete(c, config, "2026-09-14T12:00:00Z", agora)).toBe(false);
  });
});

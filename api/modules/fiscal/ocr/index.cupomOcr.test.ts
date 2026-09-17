import { describe, expect, it } from "vitest";
import { HeuristicOcrProvider } from "./index";

/**
 * Texto como o PaddleOCR devolve (uma linha por elemento, rótulo e número em
 * linhas separadas). Trechos moldados nos dois primeiros comprovantes reais
 * lidos pelo sidecar em homologação (17/09/2026), que o heurístico deixava
 * passar: "Valor a pagar R$ / 904,00" e "Dt. Entrada: 13/09/26".
 */
const CUPOM_NFCE = [
  "LOJA EXEMPLO LTDA",
  "CNPJ: 12.345.678/0001-95",
  "1,00UN X 85.00",
  "85,00",
  "Qtde.total de items",
  "17",
  "Valor a pagar R$",
  "904,00",
  "Cartão de Crédito",
  "R$904.00",
  "DATA:",
  "13/09/2026",
  "Hora:",
  "20:46",
  "Valor:",
  "904,00 BRL",
  "Consumidor CONSUMIDOR NAO IDENTIFICADO",
].join("\n");

const TICKET_ESTACIONAMENTO = [
  "Hotel Exemplo Plaza",
  "CNPJ: 00.338.915/0006-16",
  "Ticket de Entrada",
  "TICKET:0008600",
  "PLACA: ABC-1D23",
  "Dt. Entrada: 13/09/26 17:24:2",
  "Nenhum objeto declarado.",
].join("\n");

function comoTexto(texto: string) {
  return { arquivoNome: "cupom.jpeg", arquivoMime: "text/plain", arquivoBase64: Buffer.from(texto, "utf8").toString("base64") };
}

describe("heurístico sobre texto de OCR (cupom NFC-e e ticket)", () => {
  const provider = new HeuristicOcrProvider();

  it("lê 'Valor a pagar R$' com o número na linha seguinte, sem confundir com 'Qtde.total'", async () => {
    const r = await provider.extrair(comoTexto(CUPOM_NFCE));
    expect(r.valor).toBe(904);
    expect(r.dataFatoGerador).toBe("2026-09-13");
    expect(r.cnpjEmitente).toBe("12.345.678/0001-95");
  });

  it("lê 'Valor: 904,00 BRL' quando não há 'a pagar'", async () => {
    const r = await provider.extrair(comoTexto("EMPRESA X\nValor:\n904,00 BRL\nDATA:\n13/09/2026"));
    expect(r.valor).toBe(904);
  });

  it("lê data curta dd/mm/aa de ticket impresso", async () => {
    const r = await provider.extrair(comoTexto(TICKET_ESTACIONAMENTO));
    expect(r.dataFatoGerador).toBe("2026-09-13");
    expect(r.cnpjEmitente).toBe("00.338.915/0006-16");
    expect(r.valor).toBeNull(); // ticket de entrada não tem valor: fica pendente, sem inventar
    expect(r.camposPendentes).toContain("valor");
  });
});

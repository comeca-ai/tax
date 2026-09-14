import { describe, expect, it, vi } from "vitest";
import {
  chaveNfe55Valida,
  consultarNfeIo,
  interpretarRespostaNfeIo,
  LIMITE_RESPOSTA_NFE_IO,
} from "./adapter";
function chave(modelo = "55") {
  const base = `35260914200166000166${modelo}001000000007100000000`;
  let soma = 0;
  for (let i = 42, peso = 2; i >= 0; i--, peso = peso === 9 ? 2 : peso + 1)
    soma += Number(base[i]) * peso;
  const dv = 11 - (soma % 11);
  return base + (dv >= 10 ? 0 : dv);
}
const accessKey = chave();
const buyer = "99887766000155";
const input = {
  chave: accessKey,
  cnpjEsperado: buyer,
  apiKey: "synthetic-nfe-key",
};
const body = () => ({
  currentStatus: "Authorized",
  codeModel: 55,
  environmentType: "Production",
  buyer: { federalTaxNumber: Number(buyer) },
  protocol: { accessKey, statusCode: 100, environmentType: "Production" },
});
const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
describe("NFE.io consulta restrita no servidor", () => {
  it("valida formato, DV e somente modelo55 antes rede", async () => {
    expect(accessKey).toHaveLength(44);
    expect(chaveNfe55Valida(accessKey)).toBe(true);
    const fetchFn = vi.fn();
    for (const key of [
      "1".repeat(44),
      accessKey.slice(0, 43) + (accessKey.endsWith("0") ? "1" : "0"),
      chave("65"),
      accessKey + ".xml",
      "../other",
    ]) {
      expect(chaveNfe55Valida(key)).toBe(false);
      await expect(
        consultarNfeIo({ ...input, chave: key }, fetchFn)
      ).rejects.toThrow("INVALID_NFE_IO_INPUT");
    }
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it("faz exatamente GET fixo com Authorization raw, redirectdeny e timeout", async () => {
    const fetchFn = vi.fn().mockResolvedValue(response(body()));
    const result = await consultarNfeIo(input, fetchFn);
    expect(result.estado).toBe("autorizada");
    expect(fetchFn).toHaveBeenCalledOnce();
    expect(fetchFn).toHaveBeenCalledWith(
      `https://nfe.api.nfe.io/v2/productinvoices/serpro/${accessKey}`,
      expect.objectContaining({
        method: "GET",
        redirect: "error",
        signal: expect.any(AbortSignal),
        headers: { Authorization: input.apiKey, Accept: "application/json" },
      })
    );
    expect(JSON.stringify(result)).not.toContain(accessKey);
    expect(JSON.stringify(result)).not.toContain(input.apiKey);
    expect(JSON.stringify(result)).not.toContain(buyer);
  });
  it("Canceled prevalece protocolo100 e Unknown não vira autorizado", () => {
    expect(
      interpretarRespostaNfeIo(
        { ...body(), currentStatus: "Canceled" },
        accessKey,
        buyer
      ).estado
    ).toBe("cancelada");
    expect(
      interpretarRespostaNfeIo(
        { ...body(), currentStatus: "Unknown" },
        accessKey,
        buyer
      ).estado
    ).toBe("nao_autorizada");
    expect(
      interpretarRespostaNfeIo(
        { ...body(), environmentType: "Homologation" },
        accessKey,
        buyer
      ).estado
    ).toBe("homologacao");
  });
  it("nega chave/modelo divergentes, destinatário alheio e estruturas inesperadas", () => {
    expect(
      interpretarRespostaNfeIo({ ...body(), codeModel: 65 }, accessKey, buyer)
        .estado
    ).toBe("resposta_invalida");
    expect(
      interpretarRespostaNfeIo(
        { ...body(), protocol: { accessKey: "1".repeat(44), statusCode: 100 } },
        accessKey,
        buyer
      ).estado
    ).toBe("resposta_invalida");
    expect(
      interpretarRespostaNfeIo(body(), accessKey, "11111111000111").estado
    ).toBe("destinatario_divergente");
    for (const value of [
      null,
      [],
      {},
      { ...body(), protocol: null },
      { ...body(), buyer: {} },
    ])
      expect(interpretarRespostaNfeIo(value, accessKey, buyer).estado).toBe(
        "resposta_invalida"
      );
  });
  for (const [status, expected] of [
    [401, "credencial_rejeitada"],
    [403, "acesso_negado"],
    [404, "nao_localizada"],
    [429, "limite_provedor"],
    [500, "indisponivel"],
    [503, "indisponivel"],
  ] as const)
    it(`sanitiza ${status} sem retry`, async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(response({ secret: input.apiKey }, status));
      const result = await consultarNfeIo(input, fetchFn);
      expect(result.estado).toBe(expected);
      expect(fetchFn).toHaveBeenCalledOnce();
      expect(JSON.stringify(result)).not.toContain(input.apiKey);
    });
  it("timeout fica incerto, nunca repete", async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValue(new DOMException("secret", "TimeoutError"));
    expect((await consultarNfeIo(input, fetchFn)).estado).toBe(
      "timeout_incerto"
    );
    expect(fetchFn).toHaveBeenCalledOnce();
  });
  it("limita resposta mesmo sem Content-Length e recusa JSON malformado", async () => {
    for (const res of [
      new Response("{", { headers: { "content-type": "application/json" } }),
      new Response("x".repeat(LIMITE_RESPOSTA_NFE_IO + 1), {
        headers: { "content-type": "application/json" },
      }),
    ]) {
      expect(
        (await consultarNfeIo(input, vi.fn().mockResolvedValue(res))).estado
      ).toBe("resposta_invalida");
    }
  });
  it("recusa Bearer/CRLF na credencial antes rede", async () => {
    const fetchFn = vi.fn();
    for (const apiKey of ["Bearer synthetic", "synthetic\nheader", ""])
      await expect(
        consultarNfeIo({ ...input, apiKey }, fetchFn)
      ).rejects.toThrow("INVALID_NFE_IO_CONFIGURATION");
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

import { describe, expect, it } from "vitest";
import {
  criarChaveIdempotenciaWhatsapp,
  podeTentarNovamente,
} from "./fila";

describe("fila WhatsApp", () => {
  const entrada = {
    provider: "dialog360",
    direcao: "entrada" as const,
    tipoEvento: "mensagem",
    identificadorExterno: "wamid.exemplo-001",
  };

  it("gera a mesma chave para a reentrega do mesmo evento", () => {
    expect(criarChaveIdempotenciaWhatsapp(entrada)).toBe(
      criarChaveIdempotenciaWhatsapp({ ...entrada }),
    );
  });

  it("separa mensagem de entrada, saída e eventos distintos", () => {
    const chave = criarChaveIdempotenciaWhatsapp(entrada);
    expect(criarChaveIdempotenciaWhatsapp({ ...entrada, direcao: "saida" })).not.toBe(chave);
    expect(criarChaveIdempotenciaWhatsapp({ ...entrada, tipoEvento: "status" })).not.toBe(chave);
    expect(criarChaveIdempotenciaWhatsapp({ ...entrada, identificadorExterno: "wamid.exemplo-002" })).not.toBe(chave);
  });

  it("não aceita uma chave incompleta", () => {
    expect(() => criarChaveIdempotenciaWhatsapp({ ...entrada, provider: "" })).toThrow(/exige/);
  });

  it("só permite nova tentativa para estados não terminais", () => {
    expect(podeTentarNovamente("pendente")).toBe(true);
    expect(podeTentarNovamente("falhou")).toBe(true);
    expect(podeTentarNovamente("processando")).toBe(false);
    expect(podeTentarNovamente("enviado")).toBe(false);
    expect(podeTentarNovamente("processado")).toBe(false);
    expect(podeTentarNovamente("cancelado")).toBe(false);
  });
});

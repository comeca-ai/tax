import { describe, expect, it } from "vitest";
import { POLITICA_ATIVA_IMUTAVEL, politicaEditavel } from "./versao";

describe("politicaEditavel (RF-07)", () => {
  it("política ATIVA não é editável — editar é criar uma nova versão", () => {
    expect(politicaEditavel("ativa")).toBe(false);
    expect(POLITICA_ATIVA_IMUTAVEL).toContain("Crie uma nova versão");
  });

  it("rascunho e inativa são editáveis: é neles que o gestor trabalha", () => {
    expect(politicaEditavel("rascunho")).toBe(true);
    expect(politicaEditavel("inativa")).toBe(true);
  });
});

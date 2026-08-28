import { describe, expect, it } from "vitest";
import { PERFIS } from "./types";
import { podeGerenciarEquipe, perfisConvidaveis } from "./permissoes";

/**
 * As duas regras da área Equipe (v1.9.1). Ficam aqui, puras, porque servidor
 * (`equipeProcedure`, `convites.criar`) e tela (`RequireEquipe`, `AppShell`,
 * `Equipe`) precisam responder a MESMA coisa — permissão calculada em dois
 * lugares diverge no primeiro ajuste.
 */
describe("podeGerenciarEquipe", () => {
  it("admin da plataforma gerencia mesmo sem ter empresa", () => {
    expect(podeGerenciarEquipe({ perfil: "admin", ehAdminDeEmpresa: false })).toBe(true);
  });

  it("cliente dono da empresa gerencia — é o destravamento da v1.9.1", () => {
    expect(podeGerenciarEquipe({ perfil: "cliente", ehAdminDeEmpresa: true })).toBe(true);
  });

  it("cliente sem empresa não gerencia", () => {
    expect(podeGerenciarEquipe({ perfil: "cliente", ehAdminDeEmpresa: false })).toBe(false);
  });

  it("revisor sem empresa não gerencia — revisar despesa não é administrar equipe", () => {
    expect(podeGerenciarEquipe({ perfil: "revisor", ehAdminDeEmpresa: false })).toBe(false);
  });

  it("revisor dono da própria empresa gerencia a dele", () => {
    expect(podeGerenciarEquipe({ perfil: "revisor", ehAdminDeEmpresa: true })).toBe(true);
  });
});

describe("perfisConvidaveis", () => {
  it("admin da plataforma concede qualquer perfil", () => {
    expect(perfisConvidaveis("admin")).toEqual([...PERFIS]);
  });

  it("admin da empresa só convida Cliente — admin e revisor alcançam todas as empresas", () => {
    expect(perfisConvidaveis("cliente")).toEqual(["cliente"]);
    expect(perfisConvidaveis("revisor")).toEqual(["cliente"]);
  });

  it("não expõe o array PERFIS para quem chama mexer nele", () => {
    const lista = perfisConvidaveis("admin");
    lista.push("cliente");
    expect(PERFIS).toHaveLength(3);
  });
});

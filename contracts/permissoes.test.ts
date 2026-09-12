import { describe, expect, it } from "vitest";
import { PERFIS } from "./types";
import {
  exigeMotivoDelegacao,
  podeGerenciarEquipe,
  podeRevisarDespesas,
  perfisConvidaveis,
} from "./permissoes";

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

/**
 * As duas regras da fila de revisão por empresa (A1, v1.12.0). Decisões do
 * dono de 31/08: fallback do admin da empresa; admin da plataforma mantém o
 * acesso (suporte) e o `revisor` perde o passe global — era ele o furo
 * multi-tenant de `revisao.fila`.
 */
describe("podeRevisarDespesas", () => {
  const semPapel = {
    ehAdminDaEmpresa: false,
    ehAprovadorDesignado: false,
    ehAnalistaDesignado: false,
  };

  it("admin da plataforma revisa mesmo sem vínculo — suporte", () => {
    expect(podeRevisarDespesas({ perfil: "admin", ...semPapel })).toBe(true);
  });

  it("revisor da plataforma sem designação NÃO revisa — o furo fechado", () => {
    expect(podeRevisarDespesas({ perfil: "revisor", ...semPapel })).toBe(false);
  });

  it("cliente aprovador designado revisa", () => {
    expect(
      podeRevisarDespesas({ perfil: "cliente", ...semPapel, ehAprovadorDesignado: true }),
    ).toBe(true);
  });

  it("cliente analista designado revisa", () => {
    expect(
      podeRevisarDespesas({ perfil: "cliente", ...semPapel, ehAnalistaDesignado: true }),
    ).toBe(true);
  });

  it("cliente admin da empresa sem designados revisa — fallback do dia 1", () => {
    expect(
      podeRevisarDespesas({ perfil: "cliente", ...semPapel, ehAdminDaEmpresa: true }),
    ).toBe(true);
  });

  it("cliente colaborador comum não revisa", () => {
    expect(podeRevisarDespesas({ perfil: "cliente", ...semPapel })).toBe(false);
  });
});

describe("exigeMotivoDelegacao", () => {
  it("há designado e não sou ele: decide com motivo registrado", () => {
    expect(
      exigeMotivoDelegacao({ temAprovadorDesignado: true, ehAprovadorDesignado: false }),
    ).toBe(true);
  });

  it("sou o próprio aprovador designado: sem delegação", () => {
    expect(
      exigeMotivoDelegacao({ temAprovadorDesignado: true, ehAprovadorDesignado: true }),
    ).toBe(false);
  });

  it("sem designado: o fallback é o caminho normal, não uma delegação", () => {
    expect(
      exigeMotivoDelegacao({ temAprovadorDesignado: false, ehAprovadorDesignado: false }),
    ).toBe(false);
  });
});

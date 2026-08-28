import { describe, expect, it } from "vitest";
import { ehChaveDuplicada } from "./erroDb";

/**
 * O caso real: duas contas com o mesmo e-mail chegando juntas. O índice único
 * barra a segunda, mas o erro vem embrulhado pelo drizzle — se não descermos
 * até a `cause`, o usuário recebe 500 em vez de "E-mail já cadastrado".
 */
describe("ehChaveDuplicada", () => {
  it("reconhece o erro cru do mysql2", () => {
    expect(ehChaveDuplicada(Object.assign(new Error("dup"), { code: "ER_DUP_ENTRY" }))).toBe(true);
    expect(ehChaveDuplicada(Object.assign(new Error("dup"), { errno: 1062 }))).toBe(true);
  });

  it("acha o código dentro do embrulho do drizzle", () => {
    const driver = Object.assign(new Error("Duplicate entry"), { code: "ER_DUP_ENTRY" });
    const drizzle = Object.assign(new Error("Failed query: insert into `usuarios`"), {
      cause: driver,
    });
    expect(ehChaveDuplicada(drizzle)).toBe(true);
  });

  it("não confunde com outros erros de banco nem com lixo", () => {
    expect(ehChaveDuplicada(Object.assign(new Error("x"), { code: "ER_NO_SUCH_TABLE" }))).toBe(false);
    expect(ehChaveDuplicada(new Error("Failed query"))).toBe(false);
    expect(ehChaveDuplicada(null)).toBe(false);
    expect(ehChaveDuplicada("boom")).toBe(false);
  });

  it("não entra em laço infinito com cause circular", () => {
    const a = new Error("a") as Error & { cause?: unknown };
    a.cause = a;
    expect(ehChaveDuplicada(a)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { segredoSessaoObrigatorio } from "./env";

describe("segredo obrigatório de sessão", () => {
  it.each([undefined, "production", "development", "test"])(
    "nega segredo ausente ou branco em %s",
    NODE_ENV => {
      for (const APP_SECRET of [undefined, "", "  \t\n"]) {
        expect(() =>
          segredoSessaoObrigatorio({ NODE_ENV, APP_SECRET })
        ).toThrow(/APP_SECRET/);
      }
    }
  );
  it("preserva a chave configurada sem normalizar sua assinatura", () => {
    expect(
      segredoSessaoObrigatorio({ APP_SECRET: " synthetic-test-key " })
    ).toBe(" synthetic-test-key ");
  });
  it("não inclui valor da chave em mensagem de falha", () => {
    expect(() => segredoSessaoObrigatorio({ APP_SECRET: "\t\t" })).toThrow(
      "APP_SECRET must be explicitly configured and non-empty."
    );
  });
});

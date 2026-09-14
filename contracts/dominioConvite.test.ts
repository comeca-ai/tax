import { expect, it } from "vitest";
import { dominioEmail, emailDoDominio } from "./dominioConvite";
it("compara domínio completo sem diferenciar maiúsculas", () => {
  expect(dominioEmail(" Admin@Reembolsa.ia.br ")).toBe("reembolsa.ia.br");
  expect(
    emailDoDominio("PESSOA+teste@REEMBOLSA.IA.BR", "reembolsa.ia.br")
  ).toBe(true);
});
it.each([
  "pessoa@sub.reembolsa.ia.br",
  "pessoa@reembolsa.ia.br.outro.com",
  "pessoa@outroreembolsa.ia.br",
  "pessoa@reeembolsa.ia.br",
  "pessoa@gmail.com",
  "x@@reembolsa.ia.br",
])("rejeita domínio diferente ou e-mail inválido: %s", email =>
  expect(emailDoDominio(email, "reembolsa.ia.br")).toBe(false)
);

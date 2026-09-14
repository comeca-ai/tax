import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import EnvioWhatsapp from "./EnvioWhatsapp";
it("mostra pessoa, horário original em Brasília e tag sem alterar o instante", () => {
  const html = renderToStaticMarkup(
    <EnvioWhatsapp
      envio={{
        colaboradorId: 3,
        nome: "Pessoa Convidada",
        enviadoEm: "2026-09-14T12:15:00Z",
      }}
      categoria="alimentacao"
    />
  );
  expect(html).toContain("Pessoa Convidada");
  expect(html).toContain("09:15");
  expect(html).toContain('dateTime="2026-09-14T12:15:00.000Z"');
  expect(html).toContain("Alimentação");
});
it("categoria ausente aparece como A classificar e despesa do painel não vira WhatsApp", () => {
  expect(
    renderToStaticMarkup(
      <EnvioWhatsapp
        envio={{
          colaboradorId: 3,
          nome: "Pessoa",
          enviadoEm: "2026-09-14T12:15:00Z",
        }}
        categoria={null}
      />
    )
  ).toContain("A classificar");
  expect(
    renderToStaticMarkup(<EnvioWhatsapp envio={null} categoria={null} />)
  ).toBe("");
});

import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ sendMail: vi.fn() }));
vi.mock("nodemailer", () => ({ default: { createTransport: () => ({ sendMail: mocks.sendMail }) } }));
import { enviarConviteColaboradorEmail, escaparHtmlEmail } from "./mailer";

const host = process.env.SMTP_HOST;
afterEach(() => {
  if (host === undefined) delete process.env.SMTP_HOST; else process.env.SMTP_HOST = host;
  vi.restoreAllMocks(); mocks.sendMail.mockReset();
});

it("escapa texto e atributo HTML", () => {
  expect(escaparHtmlEmail('&<>"\'')).toBe("&amp;&lt;&gt;&quot;&#39;");
});

it("nome e empresa não injetam HTML no convite", async () => {
  process.env.SMTP_HOST = "smtp.example.invalid";
  mocks.sendMail.mockResolvedValue({});
  await enviarConviteColaboradorEmail({ para: "teste@example.invalid", nome: '<img src=x onerror="alert(1)">', empresa: "<b>Empresa</b>", link: 'https://example.invalid/convite/abc" onclick="alert(1)' });
  const message = mocks.sendMail.mock.calls[0]![0];
  expect(message.html).not.toContain("<img");
  expect(message.html).toContain("&lt;b&gt;Empresa&lt;/b&gt;");
  expect(message.html).not.toContain('onclick="alert');
  expect(message.text).toContain("<b>Empresa</b>");
});

it("falha SMTP não imprime resposta bruta ou token", async () => {
  process.env.SMTP_HOST = "smtp.example.invalid";
  mocks.sendMail.mockRejectedValue(new Error("token-sensivel"));
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  expect(await enviarConviteColaboradorEmail({ para: "teste@example.invalid", nome: "Teste", empresa: "Teste", link: "https://example.invalid/convite/token-sensivel" })).toEqual({ enviado: false });
  expect(JSON.stringify(log.mock.calls)).not.toContain("token-sensivel");
});

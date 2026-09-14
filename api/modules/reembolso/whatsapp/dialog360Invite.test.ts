import { afterEach, describe, expect, it, vi } from "vitest";
import {
  enviarBoasVindasWhatsapp360dialog,
  montarTemplateBoasVindasWhatsapp,
} from "./dialog360Invite";

const apiKeyOriginal = process.env.DIALOG_360_API_KEY;
const templateOriginal = process.env.DIALOG_360_WELCOME_TEMPLATE;
const idiomaOriginal = process.env.DIALOG_360_WELCOME_TEMPLATE_LANGUAGE;
const fetchOriginal = globalThis.fetch;

afterEach(() => {
  if (apiKeyOriginal === undefined) delete process.env.DIALOG_360_API_KEY;
  else process.env.DIALOG_360_API_KEY = apiKeyOriginal;
  if (templateOriginal === undefined)
    delete process.env.DIALOG_360_WELCOME_TEMPLATE;
  else process.env.DIALOG_360_WELCOME_TEMPLATE = templateOriginal;
  if (idiomaOriginal === undefined)
    delete process.env.DIALOG_360_WELCOME_TEMPLATE_LANGUAGE;
  else process.env.DIALOG_360_WELCOME_TEMPLATE_LANGUAGE = idiomaOriginal;
  globalThis.fetch = fetchOriginal;
  vi.restoreAllMocks();
});

describe("template de boas-vindas 360dialog", () => {
  it("monta o template ativo com o nome do colaborador", () => {
    expect(
      montarTemplateBoasVindasWhatsapp({
        telefone: "5511997776666",
        nome: "João da Silva",
        template: "boas_vindas_reembolsa",
        idioma: "pt_BR",
      })
    ).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "5511997776666",
      type: "template",
      template: {
        name: "boas_vindas_reembolsa",
        language: { code: "pt_BR" },
        components: [
          {
            type: "body",
            parameters: [{ type: "text", text: "João da Silva" }],
          },
        ],
      },
    });
  });

  it("devolve o messageId aceito pelo provedor", async () => {
    process.env.DIALOG_360_API_KEY = "chave-de-teste";
    process.env.DIALOG_360_WELCOME_TEMPLATE = "boas_vindas_reembolsa";
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ messages: [{ id: "wamid.abc123" }] }), {
          status: 200,
        })
      );

    await expect(
      enviarBoasVindasWhatsapp360dialog({
        telefone: "+55 11 99999-9999",
        nome: "João",
      })
    ).resolves.toEqual({
      enviado: true,
      messageId: "wamid.abc123",
      status: "aceito",
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://waba-v2.360dialog.io/messages",
      expect.objectContaining({
        method: "POST",
        redirect: "error",
        headers: expect.objectContaining({ "D360-API-KEY": "chave-de-teste" }),
      })
    );
  });

  function configurar() {
    process.env.DIALOG_360_API_KEY = "segredo-sintetico";
    process.env.DIALOG_360_WELCOME_TEMPLATE = "boas_vindas_reembolsa";
    process.env.DIALOG_360_WELCOME_TEMPLATE_LANGUAGE = "pt_BR";
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  }

  it.each([401, 403, 429, 500, 502])(
    "HTTP %s não causa nova tentativa",
    async http => {
      configurar();
      globalThis.fetch = vi
        .fn()
        .mockResolvedValue(new Response("segredo-sintetico", { status: http }));
      const resultado = await enviarBoasVindasWhatsapp360dialog({
        telefone: "5511999999999",
        nome: "João",
      });
      expect(resultado).toEqual({
        enviado: false,
        messageId: null,
        status: http >= 500 ? "incerto" : "falhou",
      });
      expect(globalThis.fetch).toHaveBeenCalledOnce();
      expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
        "segredo-sintetico"
      );
    }
  );

  it.each([
    "{}",
    "invalid-json",
    JSON.stringify({ messages: [{ id: "nao-wamid" }] }),
    "a".repeat(65_537),
  ])("resposta sem confirmação válida é incerta (%#)", async body => {
    configurar();
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(body));
    expect(
      await enviarBoasVindasWhatsapp360dialog({
        telefone: "5511999999999",
        nome: "João",
      })
    ).toEqual({ enviado: false, messageId: null, status: "incerto" });
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });

  it("timeout não expõe erro bruto nem autoriza retry", async () => {
    configurar();
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new Error("segredo-sintetico"));
    expect(
      (
        await enviarBoasVindasWhatsapp360dialog({
          telefone: "5511999999999",
          nome: "João",
        })
      ).status
    ).toBe("incerto");
    expect(globalThis.fetch).toHaveBeenCalledOnce();
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
      "segredo-sintetico"
    );
  });

  it("sem configuração não faz chamada", async () => {
    configurar();
    delete process.env.DIALOG_360_API_KEY;
    globalThis.fetch = vi.fn();
    expect(
      (
        await enviarBoasVindasWhatsapp360dialog({
          telefone: "5511999999999",
          nome: "João",
        })
      ).status
    ).toBe("nao_configurado");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it.each(["123", "00000000000", "1".repeat(16)])(
    "telefone inválido %s é barrado antes da rede",
    async telefone => {
      configurar();
      globalThis.fetch = vi.fn();
      expect(
        (await enviarBoasVindasWhatsapp360dialog({ telefone, nome: "João" }))
          .status
      ).toBe("falhou");
      expect(globalThis.fetch).not.toHaveBeenCalled();
    }
  );
});

import { ReservaConsultaPocIndisponivel } from "../../../lib/pocConsultas";
it("bloqueio comprovado antes da rede não é resultado incerto", async () => {
  process.env.DIALOG_360_API_KEY = "chave-de-teste";
  process.env.DIALOG_360_WELCOME_TEMPLATE = "boas_vindas_reembolsa";
  globalThis.fetch = vi
    .fn()
    .mockRejectedValue(new ReservaConsultaPocIndisponivel());
  expect(
    await enviarBoasVindasWhatsapp360dialog({
      telefone: "5511999999999",
      nome: "Fixture",
    })
  ).toEqual({ enviado: false, messageId: null, status: "limite_atingido" });
});

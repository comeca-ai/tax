import { Hono } from "hono";
import { exigirServicoAutenticado, type ServicoEnv } from "./servicoAuth";
import { describe, expect, it, vi } from "vitest";
import { criarRouterComprovanteWhatsapp } from "./comprovanteRouter";

const token = "fixture-tenant-aaaaaaaaaaaaaaaaaaaaaaaa";
function montar(router: Hono<ServicoEnv>) {
  const app = new Hono<ServicoEnv>();
  app.use(
    "/*",
    exigirServicoAutenticado(JSON.stringify([{ token, empresaId: 1 }]))
  );
  app.route("/", router);
  return {
    request: (url: string, init: RequestInit = {}) =>
      app.request(url, {
        ...init,
        headers: { ...init.headers, Authorization: `Bearer ${token}` },
      }),
  };
}

describe("rota multipart de comprovante WhatsApp", () => {
  it("valida o arquivo antes de encaminhar para persistência", async () => {
    const receber = vi
      .fn()
      .mockResolvedValue({ despesaId: 42, situacao: "em_revisao" });
    const app = montar(criarRouterComprovanteWhatsapp(receber));
    const form = new FormData();
    form.set("empresa_id", "1");
    form.set("colaborador_id", "2");
    form.set("mensagem_id", "wamid.001");
    form.set(
      "arquivo",
      new File([Buffer.from("%PDF-1.7")], "nota.pdf", {
        type: "application/pdf",
      })
    );
    const resposta = await app.request("http://local/despesas", {
      method: "POST",
      body: form,
    });
    expect(resposta.status).toBe(201);
    expect(receber).toHaveBeenCalledWith(
      expect.objectContaining({
        empresaId: 1,
        colaboradorId: 2,
        mensagemId: "wamid.001",
      })
    );
  });

  it("bloqueia arquivo disfarçado antes de qualquer persistência", async () => {
    const receber = vi.fn();
    const app = montar(criarRouterComprovanteWhatsapp(receber));
    const form = new FormData();
    form.set("empresa_id", "1");
    form.set("colaborador_id", "2");
    form.set("mensagem_id", "wamid.001");
    form.set(
      "arquivo",
      new File(["texto"], "nota.pdf", { type: "application/pdf" })
    );
    expect(
      (
        await app.request("http://local/despesas", {
          method: "POST",
          body: form,
        })
      ).status
    ).toBe(400);
    expect(receber).not.toHaveBeenCalled();
  });
});
it("token da empresa A não pode escolher empresa B no formulário", async () => {
  const receber = vi.fn();
  const app = montar(criarRouterComprovanteWhatsapp(receber));
  const form = new FormData();
  form.set("empresa_id", "2");
  form.set("colaborador_id", "3");
  form.set("mensagem_id", "fixture");
  form.set(
    "arquivo",
    new File(["%PDF-test"], "fixture.pdf", { type: "application/pdf" })
  );
  expect(
    (await app.request("http://local/despesas", { method: "POST", body: form }))
      .status
  ).toBe(403);
  expect(receber).not.toHaveBeenCalled();
});
it("router não montado com autenticação também falha fechado", async () => {
  const receber = vi.fn();
  expect(
    (
      await criarRouterComprovanteWhatsapp(receber).request(
        "http://local/despesas",
        { method: "POST" }
      )
    ).status
  ).toBe(401);
  expect(receber).not.toHaveBeenCalled();
});
it("empresa pode ser omitida: autoridade vem exclusivamente da credencial", async () => {
  const receber = vi.fn().mockResolvedValue({ despesaId: 42 });
  const app = montar(criarRouterComprovanteWhatsapp(receber));
  const form = new FormData();
  form.set("colaborador_id", "2");
  form.set("mensagem_id", "fixture");
  form.set(
    "arquivo",
    new File(["%PDF-test"], "fixture.pdf", { type: "application/pdf" })
  );
  expect(
    (await app.request("http://local/despesas", { method: "POST", body: form }))
      .status
  ).toBe(201);
  expect(receber).toHaveBeenCalledWith(
    expect.objectContaining({ empresaId: 1 })
  );
});

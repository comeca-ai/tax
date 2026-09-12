import { describe, expect, it, vi } from "vitest";
import { criarRouterComprovanteWhatsapp } from "./comprovanteRouter";

describe("rota multipart de comprovante WhatsApp", () => {
  it("valida o arquivo antes de encaminhar para persistência", async () => {
    const receber = vi.fn().mockResolvedValue({ despesaId: 42, situacao: "em_revisao" });
    const app = criarRouterComprovanteWhatsapp(receber);
    const form = new FormData();
    form.set("empresa_id", "1"); form.set("colaborador_id", "2"); form.set("mensagem_id", "wamid.001");
    form.set("arquivo", new File([Buffer.from("%PDF-1.7")], "nota.pdf", { type: "application/pdf" }));
    const resposta = await app.request("http://local/despesas", { method: "POST", body: form });
    expect(resposta.status).toBe(201);
    expect(receber).toHaveBeenCalledWith(expect.objectContaining({ empresaId: 1, colaboradorId: 2, mensagemId: "wamid.001" }));
  });

  it("bloqueia arquivo disfarçado antes de qualquer persistência", async () => {
    const receber = vi.fn(); const app = criarRouterComprovanteWhatsapp(receber); const form = new FormData();
    form.set("empresa_id", "1"); form.set("colaborador_id", "2"); form.set("mensagem_id", "wamid.001");
    form.set("arquivo", new File(["texto"], "nota.pdf", { type: "application/pdf" }));
    expect((await app.request("http://local/despesas", { method: "POST", body: form })).status).toBe(400);
    expect(receber).not.toHaveBeenCalled();
  });
});

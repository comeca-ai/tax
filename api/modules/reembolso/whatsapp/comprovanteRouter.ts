import { Hono } from "hono";
import { validarComprovanteWhatsapp } from "./comprovante";

export type PedidoComprovanteWhatsapp = {
  empresaId: number;
  colaboradorId: number;
  mensagemId: string;
  recebidoEm: string | null;
  comprovante: NonNullable<ReturnType<typeof validarComprovanteWhatsapp>["comprovante"]>;
};

export type ReceberComprovanteWhatsapp = (pedido: PedidoComprovanteWhatsapp) => Promise<unknown>;

function inteiroPositivo(valor: FormDataEntryValue | null): number | null {
  if (typeof valor !== "string" || !/^\d+$/.test(valor)) return null;
  const numero = Number(valor);
  return Number.isSafeInteger(numero) && numero > 0 ? numero : null;
}

/** Porta HTTP da POC. A persistência/decisão entra pelo recebedor injetado. */
export function criarRouterComprovanteWhatsapp(receber: ReceberComprovanteWhatsapp) {
  const app = new Hono();
  app.post("/despesas", async c => {
    const form = await c.req.formData().catch(() => null);
    if (!form) return c.json({ error: "Formulário inválido." }, 400);
    const empresaId = inteiroPositivo(form.get("empresa_id"));
    const colaboradorId = inteiroPositivo(form.get("colaborador_id"));
    const mensagemId = form.get("mensagem_id");
    const arquivo = form.get("arquivo");
    if (!empresaId || !colaboradorId || typeof mensagemId !== "string" || !mensagemId.trim() || mensagemId.length > 128 || typeof arquivo === "string" || !arquivo) {
      return c.json({ error: "Dados do comprovante inválidos." }, 400);
    }
    const validacao = validarComprovanteWhatsapp({
      arquivoNome: arquivo.name,
      arquivoMime: arquivo.type,
      conteudo: Buffer.from(await arquivo.arrayBuffer()),
    });
    if (!validacao.ok) return c.json({ error: validacao.erro }, 400);
    const recebidoEm = form.get("recebido_em");
    const resultado = await receber({
      empresaId,
      colaboradorId,
      mensagemId: mensagemId.trim(),
      recebidoEm: typeof recebidoEm === "string" && recebidoEm ? recebidoEm : null,
      comprovante: validacao.comprovante,
    });
    return c.json(resultado, 201);
  });
  return app;
}

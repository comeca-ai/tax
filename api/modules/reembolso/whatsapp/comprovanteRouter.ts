import { Hono } from "hono";
import type { ServicoEnv } from "./servicoAuth";
import {
  validarComprovanteWhatsapp,
  type ComprovanteValidado,
} from "./comprovante";
import type { OcrExtracao } from "../../../../contracts/types";

export type PedidoComprovanteWhatsapp = {
  empresaId: number;
  colaboradorId: number;
  mensagemId: string;
  recebidoEm: string | null;
  comprovante: ComprovanteValidado;
  extracao?: OcrExtracao;
};

export type ReceberComprovanteWhatsapp = (
  pedido: PedidoComprovanteWhatsapp
) => Promise<unknown>;

function inteiroPositivo(valor: unknown): number | null {
  if (typeof valor !== "string" || !/^\d+$/.test(valor)) return null;
  const numero = Number(valor);
  return Number.isSafeInteger(numero) && numero > 0 ? numero : null;
}

function ehErroDeVinculo(erro: unknown): boolean {
  return (
    typeof erro === "object" &&
    erro !== null &&
    "codigo" in erro &&
    erro.codigo === "VINCULO_INVALIDO"
  );
}

/** Porta HTTP da POC. A persistência/decisão entra pelo recebedor injetado. */
export function criarRouterComprovanteWhatsapp(
  receber: ReceberComprovanteWhatsapp
) {
  const app = new Hono<ServicoEnv>();
  app.post("/despesas", async c => {
    const tenant = c.get("servicoTenant");
    if (!tenant) return c.json({ error: "Unauthorized" }, 401);
    const form = await c.req.formData().catch(() => null);
    if (!form) return c.json({ error: "Formulário inválido." }, 400);
    const empresaInformada = form.get("empresa_id");
    if (
      empresaInformada !== null &&
      inteiroPositivo(empresaInformada) !== tenant.empresaId
    )
      return c.json({ error: "Forbidden" }, 403);
    const empresaId = tenant.empresaId;
    const colaboradorId = inteiroPositivo(form.get("colaborador_id"));
    const mensagemId = form.get("mensagem_id");
    const arquivo = form.get("arquivo");
    if (
      !empresaId ||
      !colaboradorId ||
      typeof mensagemId !== "string" ||
      !mensagemId.trim() ||
      mensagemId.length > 128 ||
      typeof arquivo === "string" ||
      !arquivo
    ) {
      return c.json({ error: "Dados do comprovante inválidos." }, 400);
    }
    const validacao = validarComprovanteWhatsapp({
      arquivoNome: arquivo.name,
      arquivoMime: arquivo.type,
      conteudo: Buffer.from(await arquivo.arrayBuffer()),
    });
    if (!validacao.ok) return c.json({ error: validacao.erro }, 400);
    const recebidoEm = form.get("recebido_em");
    try {
      const resultado = await receber({
        empresaId,
        colaboradorId,
        mensagemId: mensagemId.trim(),
        recebidoEm:
          typeof recebidoEm === "string" && recebidoEm ? recebidoEm : null,
        comprovante: validacao.comprovante,
      });
      return c.json(resultado, 201);
    } catch (erro) {
      if (
        typeof erro === "object" &&
        erro !== null &&
        "codigo" in erro &&
        erro.codigo === "DUPLICADO"
      ) {
        return c.json(
          { error: "Este comprovante já foi registrado na empresa." },
          409
        );
      }
      if (ehErroDeVinculo(erro)) {
        return c.json(
          { error: "Colaborador sem vínculo ativo na empresa." },
          403
        );
      }
      // Não expõe detalhes de banco, mídia ou provider ao integrador.
      return c.json(
        { error: "Não foi possível registrar o comprovante." },
        503
      );
    }
  });
  return app;
}

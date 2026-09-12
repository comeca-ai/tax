import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env } from "./lib/env";
import { getWhatsappProvider, parseEvolutionPayload } from "./modules/reembolso/whatsapp";
import { processarMensagemRecebida } from "./modules/reembolso/agente";
import { processarWebhookDialog360 } from "./modules/reembolso/whatsapp/dialog360";
import { criarRouterIdentificacaoWhatsapp } from "./modules/reembolso/whatsapp/identificacao";
import { resolverColaboradoresPorTelefone } from "./modules/reembolso/whatsapp/identificacaoDb";
import { exigirServicoAutenticado } from "./modules/reembolso/whatsapp/servicoAuth";

const app = new Hono<{ Bindings: HttpBindings }>();

app.use(bodyLimit({ maxSize: 50 * 1024 * 1024 }));
app.use("/api/trpc/*", async (c) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
  });
});
// ── Health check (deploy/monitoramento) ─────────────────────────────────────
app.get("/api/health", (c) => c.json({ ok: true, ts: new Date().toISOString() }));

// ── API de serviço da POC WhatsApp ─────────────────────────────────────────
// Esta superfície não compartilha cookies/sessões do painel. Sem token
// configurado ela fica fechada, inclusive em homologação, até a próxima etapa
// publicar os endpoints de negócio.
app.use("/api/v1/*", exigirServicoAutenticado(env.whatsappServiceApiTokens));
app.get("/api/v1/whatsapp/status", (c) =>
  c.json({ ok: true, service: "whatsapp-poc", channelEnabled: false }),
);
app.route("/api/v1", criarRouterIdentificacaoWhatsapp(resolverColaboradoresPorTelefone));

// ── Webhook WhatsApp (fundação — v1.2.0) ────────────────────────────────────
// Base para o futuro bot: o usuário envia foto do recibo pelo WhatsApp e o
// pipeline (OCR → motor de regras → despesa) cria o lançamento automaticamente.
// Hoje este endpoint apenas atende a verificação da Meta e registra mensagens
// recebidas no log — ver README, seção "WhatsApp (fundação)".
app.get("/api/webhooks/whatsapp", (c) => {
  const mode = c.req.query("hub.mode");
  const token = c.req.query("hub.verify_token");
  const challenge = c.req.query("hub.challenge");
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  if (verifyToken && mode === "subscribe" && token === verifyToken) {
    return c.text(challenge ?? "", 200);
  }
  return c.text("Forbidden", 403);
});

app.post("/api/webhooks/whatsapp", async (c) => {
  if (!process.env.WHATSAPP_VERIFY_TOKEN) {
    return c.json({ error: "WhatsApp não configurado neste ambiente." }, 503);
  }
  try {
    const body = await c.req.json();
    // Resume mensagens recebidas no log (futuro: foto de recibo → OCR → despesa).
    const entries = body?.entry ?? [];
    for (const entry of entries) {
      for (const change of entry?.changes ?? []) {
        const mensagens = change?.value?.messages ?? [];
        for (const msg of mensagens) {
          console.log(
            `[whatsapp] mensagem recebida — from: ${msg?.from ?? "?"}, tipo: ${msg?.type ?? "?"}`,
          );
        }
      }
    }
  } catch (err) {
    console.error("[whatsapp] Falha ao processar webhook:", err);
  }
  // Sempre 200 para a Meta não reenviar o evento indefinidamente.
  return c.json({ received: true }, 200);
});

// ── Webhook Evolution (v1.5.0 — D-010/D-011) ────────────────────────────────
// O Evolution roda em stack separado na VPS e empurra cada mensagem recebida
// para cá. Autenticação opcional: se WHATSAPP_WEBHOOK_SECRET estiver definido,
// o Evolution deve enviar o mesmo valor no header `x-webhook-secret`.
// Sempre 200 — o provider não deve reenviar o evento em loop.
app.post("/api/whatsapp/webhook", async (c) => {
  const segredo = process.env.WHATSAPP_WEBHOOK_SECRET;
  if (segredo && c.req.header("x-webhook-secret") !== segredo) {
    return c.json({ error: "Forbidden" }, 403);
  }
  try {
    const body = await c.req.json();
    const msg = parseEvolutionPayload(body);
    if (msg) {
      // Sem provider configurado o agente roda em modo log (dev/homolog).
      await processarMensagemRecebida(msg, getWhatsappProvider());
    }
  } catch (err) {
    console.error("[whatsapp] Falha ao processar webhook Evolution:", err);
  }
  return c.json({ received: true }, 200);
});

// ── Webhook 360dialog (WhatsApp Business Cloud API) — v1.13.0 ───────────────
// Canal dedicado da plataforma (+55 21 96848 3003) — evento de PLATAFORMA, não
// por empresa (sem tenant nesta demanda). Só persiste cru; não roteia, não
// libera tráfego real de negócio (D-020). Bloco independente: não altera os
// dois webhooks de WhatsApp acima. Fail-closed: sem DIALOG_360_WEBHOOK_SECRET
// configurado, a rota fica sempre 403. Decisão isolada em
// processarWebhookDialog360 (testável sem montar o app Hono).
app.post("/api/webhooks/360dialog", async (c) => {
  const body = await c.req.json().catch(() => null);
  const resultado = processarWebhookDialog360(
    c.req.header("Authorization"),
    body,
    env.dialog360WebhookSecret,
  );
  return c.json(resultado.corpo, resultado.status);
});

app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

export default app;

if (env.isProduction) {
  const { serve } = await import("@hono/node-server");
  const { serveStaticFiles } = await import("./lib/vite");
  serveStaticFiles(app);

  const port = parseInt(process.env.PORT || "3000");
  serve({ fetch: app.fetch, port }, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

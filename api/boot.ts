import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env } from "./lib/env";
import { criarRouterWebhookDialog360 } from "./modules/reembolso/whatsapp/dialog360Router";
import {
  iniciarWorkerWhatsapp,
  whatsappPocHabilitado,
} from "./modules/reembolso/whatsapp/worker";
import { criarRouterComprovanteWhatsapp } from "./modules/reembolso/whatsapp/comprovanteRouter";
import { receberComprovanteWhatsapp } from "./modules/reembolso/whatsapp/comprovanteDb";
import { criarRouterIdentificacaoWhatsapp } from "./modules/reembolso/whatsapp/identificacao";
import { resolverColaboradoresPorTelefone } from "./modules/reembolso/whatsapp/identificacaoDb";
import { exigirServicoAutenticado } from "./modules/reembolso/whatsapp/servicoAuth";
import { iniciarWorkerMaps } from "./modules/reembolso/campo/calculoMaps";
import { instalarLimiteChamadasPoc } from "./lib/pocConsultas";

const app = new Hono<{ Bindings: HttpBindings }>();

// Autentica antes de consumir corpo; o limite menor evita JSON público de 50 MB.
app.route("/", criarRouterWebhookDialog360(env.dialog360WebhookSecret));
// D-022: superfícies legadas não podem contornar a autenticação do canal único.
app.all("/api/whatsapp/webhook", c => c.json({ error: "Gone" }, 410));
app.all("/api/webhooks/whatsapp", c => c.json({ error: "Gone" }, 410));
app.use(bodyLimit({ maxSize: 50 * 1024 * 1024 }));
app.use("/api/trpc/*", async c => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
  });
});
// ── Health check (deploy/monitoramento) ─────────────────────────────────────
app.get("/api/health", c => c.json({ ok: true, ts: new Date().toISOString() }));

// ── API de serviço da POC WhatsApp ─────────────────────────────────────────
// Esta superfície não compartilha cookies/sessões do painel. Sem token
// configurado ela fica fechada, inclusive em homologação.
app.use("/api/v1/*", exigirServicoAutenticado(process.env.WHATSAPP_SERVICE_TENANT_TOKENS));
app.get("/api/v1/whatsapp/status", c =>
  c.json({
    ok: true,
    service: "whatsapp-poc",
    channelEnabled: whatsappPocHabilitado(),
  })
);
app.route(
  "/api/v1",
  criarRouterIdentificacaoWhatsapp(resolverColaboradoresPorTelefone)
);
app.route(
  "/api/v1",
  criarRouterComprovanteWhatsapp(receberComprovanteWhatsapp)
);
app.all("/api/*", c => c.json({ error: "Not Found" }, 404));

export default app;

if (env.isProduction) {
  instalarLimiteChamadasPoc();
  // Callbacks padrão conectam conversa de campo, documentos e scanner serial de lembretes.
  iniciarWorkerWhatsapp();
  iniciarWorkerMaps();
  const { serve } = await import("@hono/node-server");
  const { serveStaticFiles } = await import("./lib/vite");
  serveStaticFiles(app);

  const port = parseInt(process.env.PORT || "3000");
  const hostname = process.env.APP_HOST || "127.0.0.1";
  serve({ fetch: app.fetch, port, hostname }, () => {
    console.log(`Server running on port ${port}`);
  });
}

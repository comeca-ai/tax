import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import {
  autenticarWebhookDialog360,
  processarWebhookDialog360,
} from "./dialog360";

export function criarRouterWebhookDialog360(
  secret: string | undefined,
  processar = processarWebhookDialog360
) {
  const app = new Hono();
  let persistenciasEmCurso = 0;
  app.use("/api/webhooks/360dialog", async (c, next) => {
    if (!autenticarWebhookDialog360(c.req.header("Authorization"), secret))
      return c.json({ error: "Forbidden" }, 403);
    return next();
  });
  app.use("/api/webhooks/360dialog", bodyLimit({ maxSize: 1024 * 1024 }));
  app.post("/api/webhooks/360dialog", async c => {
    if (persistenciasEmCurso >= 32)
      return c.json({ error: "Temporarily unavailable" }, 503);
    const body = await c.req.json().catch(() => null);
    persistenciasEmCurso++;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      // Commit tardio após 503 permanece seguro: a próxima entrega deduplica.
      const pending = processar(
        c.req.header("Authorization"),
        body,
        secret
      ).finally(() => {
        persistenciasEmCurso--;
      });
      const result = await Promise.race([
        pending,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error("Prazo de persistência")),
            4_000
          );
        }),
      ]);
      return c.json(result.corpo, result.status);
    } catch {
      return c.json({ error: "Temporarily unavailable" }, 503);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  });
  return app;
}

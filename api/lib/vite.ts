import type { Hono } from "hono";
import type { HttpBindings } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import fs from "fs";
import path from "path";

type App = Hono<{ Bindings: HttpBindings }>;

export function serveStaticFiles(app: App) {
  const distPath = path.resolve(import.meta.dirname, "../dist/public");

  // Cache headers: assets com hash no nome são imutáveis (podem cachear
  // para sempre); HTML nunca cacheia — senão após cada deploy o browser
  // usa um index.html velho que aponta para assets que já não existem
  // (página sem CSS, variando por navegador conforme o cache local).
  // Headers precisam ser setados ANTES do next(): o serveStatic do
  // @hono/node-server monta a Response final e ignora sets posteriores.
  app.use("*", async (c, next) => {
    const p = c.req.path;
    if (p.startsWith("/assets/")) {
      c.header("Cache-Control", "public, max-age=31536000, immutable");
    } else if (p === "/" || !path.extname(p)) {
      // HTML (index + rotas SPA) e APIs — sempre revalidar
      c.header("Cache-Control", "no-cache");
    }
    await next();
  });

  app.use("*", serveStatic({ root: "./dist/public" }));

  app.notFound((c) => {
    const accept = c.req.header("accept") ?? "";
    if (!accept.includes("text/html")) {
      return c.json({ error: "Not Found" }, 404);
    }
    const indexPath = path.resolve(distPath, "index.html");
    const content = fs.readFileSync(indexPath, "utf-8");
    return c.html(content);
  });
}

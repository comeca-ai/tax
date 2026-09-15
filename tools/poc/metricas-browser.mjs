/** Browser sintético: não inicia API, não usa banco, credenciais ou providers. */
import assert from "node:assert/strict";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { pathToFileURL } from "node:url";
const root = path.resolve(import.meta.dirname, "../..");
const fixture = path.join(root, ".metricas-browser-fixture");
const output =
  process.env.POC_BROWSER_REPORT || "/tmp/poc-metricas-browser.json";
const modulePath =
  process.env.PLAYWRIGHT_CORE_PATH ||
  "/root/.local/share/tax-preview/browser/node_modules/playwright-core/index.mjs";
const { chromium } = await import(pathToFileURL(modulePath).href);
let server, browser;
const checks = [];
try {
  await mkdir(fixture, { recursive: true });
  await writeFile(
    path.join(fixture, "index.html"),
    '<html><div id="root"></div><script type="module" src="/.metricas-browser-fixture/main.tsx"></script></html>'
  );
  await writeFile(
    path.join(fixture, "main.tsx"),
    `import React from 'react'; import {createRoot} from 'react-dom/client'; import {MemoryRouter} from 'react-router'; import {TRPCProvider} from '../src/providers/trpc'; import MetricasPoc from '../src/components/metricas/MetricasPoc'; createRoot(document.getElementById('root')!).render(<MemoryRouter><TRPCProvider><MetricasPoc empresa={{id:42,usuarioId:7}} de="2026-09-01" ate="2026-09-15" /></TRPCProvider></MemoryRouter>);`
  );
  server = await createServer({
    root,
    configFile: false,
    envDir: fixture,
    envPrefix: "POC_BROWSER_FIXTURE_",
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.join(root, "src"),
        "@contracts": path.join(root, "contracts"),
        "@db": path.join(root, "db"),
      },
    },
    server: { host: "127.0.0.1", port: 4318, strictPort: true },
  });
  await server.listen();
  browser = await chromium.launch({
    executablePath:
      process.env.CHROMIUM_PATH ||
      "/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-background-networking"],
  });
  const page = await browser.newPage({ timezoneId: "America/Sao_Paulo" });
  let roleId = 7,
    fail = false;
  const mutations = [];
  const duracao = {
    mediaMs: null,
    denominador: 0,
    semDadosOuInconsistentes: 1,
  };
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.origin !== "http://127.0.0.1:4318") return route.abort();
    if (!url.pathname.startsWith("/api/trpc/")) return route.continue();
    const names = url.pathname.split("/").at(-1).split(",");
    const response = names.map(name => {
      if (fail && name === "metricasPoc.resumo")
        return {
          error: {
            json: {
              message: "Falha sintética",
              code: -32603,
              data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500 },
            },
          },
        };
      if (name === "auth.me")
        return {
          result: {
            data: {
              json: {
                id: roleId,
                perfil: "cliente",
                nome: "Auditor sintético",
              },
            },
          },
        };
      if (name === "metricasPoc.resumo") {
        const input = JSON.parse(url.searchParams.get("input"));
        const filtro = Object.values(input).find(v => v.json?.empresaId)?.json;
        assert.equal(filtro.empresaId, 42);
        assert.equal(filtro.fim, "2026-09-16T00:00:00.000Z");
        return {
          result: {
            data: {
              json: {
                denominadorDespesas: 1,
                emRevisao: 0,
                pagamentosManuais: 0,
                criacaoAteDecisao: duracao,
                criacaoAtePagamento: duracao,
                decisaoAtePagamento: duracao,
                amostras: [],
                limites: ["Amostra sintética sem aceite."],
                registrosInvalidos: 0,
              },
            },
          },
        };
      }
      mutations.push({ name, body: JSON.parse(route.request().postData()) });
      return { result: { data: { json: { registrado: true } } } };
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(response),
    });
  });
  await page.goto("http://127.0.0.1:4318/.metricas-browser-fixture/index.html");
  await page.getByText("1 despesas ·").waitFor();
  checks.push("consulta empresa/período e estados sem dados");
  const form = page.locator("form").first();
  await form.locator("[name=despesaId]").fill("5");
  await form.locator("[name=conjunto]").fill("piloto-sintetico");
  await form.locator("[name=campo]").fill("manipulacao");
  await form.locator("[name=previsto]").selectOption("sim");
  await form.locator("[name=observado]").selectOption("nao");
  await form
    .locator("[name=evidencia]")
    .fill("Documento sintético conferido manualmente.");
  await form.getByRole("button").click();
  await page.getByText("Avaliação registrada com autoria.").waitFor();
  const a = Object.values(mutations[0].body)[0].json;
  assert.equal(a.empresaId, 42);
  assert.equal(a.observado, false);
  checks.push("amostra binária com evidência");
  const pay = page.locator("form").last();
  await pay.locator("[name=despesaId]").fill("5");
  await pay.locator("[name=referencia]").fill("pagamento-sintetico");
  await pay.locator("[name=pagoEm]").fill("2026-09-01T12:00");
  await pay.getByRole("button").click();
  await page.getByText("Pagamento manual registrado com autoria.").waitFor();
  const pagamento = Object.values(mutations[1].body)[0].json;
  assert.equal(pagamento.empresaId, 42);
  assert.equal(pagamento.pagoEm, "2026-09-01T15:00:00.000Z");
  checks.push("pagamento manual limitado à empresa e convertido do fuso local");
  fail = true;
  await page.reload();
  await page.getByRole("button", { name: "Tentar novamente" }).waitFor();
  fail = false;
  await page.getByRole("button", { name: "Tentar novamente" }).click();
  await page.getByText("1 despesas ·").waitFor();
  checks.push("erro e recuperação");
  roleId = 9;
  await page.reload();
  await page.getByText("Métricas e registros do piloto disponíveis").waitFor();
  assert.equal(await page.locator("form").count(), 0);
  checks.push("permissão restringe formulários");
  await writeFile(
    output,
    JSON.stringify({ syntheticOnly: true, success: true, checks }, null, 2)
  );
  console.log(JSON.stringify({ success: true, checks: checks.length, output }));
} finally {
  await browser?.close();
  await server?.close();
  await rm(fixture, { recursive: true, force: true });
}

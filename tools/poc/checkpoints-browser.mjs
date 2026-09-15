import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import superjson from "superjson";
import { tsImport } from "tsx/esm/api";

// Interface real + respostas tRPC sintéticas. Não executa API, banco ou provedor.
// node tools/poc/checkpoints-browser.mjs --output /tmp/checkpoints-browser
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
assert.ok(args.length === 0 || (args.length === 2 && args[0] === "--output"), "Use --output DIRETORIO");
const output = path.resolve(args[1] ?? path.join(os.tmpdir(), `checkpoints-browser-${Date.now()}`));
const origin = "http://127.0.0.1:3208";
const report = {
  startedAt: new Date().toISOString(), sourceCommit: null, sourceFingerprint: null,
  interface: "React real via Vite isolado", api: "tRPC interceptada com fixtures sintéticas",
  authentication: "resposta auth.me simulada; login não exercitado",
  databaseAccess: false, providerCalls: 0, homologationProven: false, acceptanceProven: false,
  externalRequestsSuppressed: 0, unexpectedRequests: [], browserErrors: [],
  checks: [], screenshots: [], success: false,
};
let server, browser, phase = "preparacao";
const activeGates = new Set();
const files = execFileSync("git", ["ls-files", "-z", "src", "contracts", "api/modules/reembolso/campo/dominio.ts", "package-lock.json", "index.html"], { cwd: ROOT }).toString().split("\0").filter(Boolean).sort();
async function fingerprint() {
  const hash = createHash("sha256");
  for (const file of files) hash.update(file).update("\0").update(await readFile(path.join(ROOT, file))).update("\0");
  return hash.digest("hex");
}
function gate() {
  let resolve;
  const wait = new Promise(done => { resolve = done; });
  const release = () => { resolve(); activeGates.delete(release); };
  activeGates.add(release);
  return { wait, release };
}
async function check(name, run) {
  phase = name;
  const started = Date.now();
  await run();
  report.checks.push({ name, passed: true, durationMs: Date.now() - started });
}
async function shot(page, name) {
  // Viewport preserva a posição real do cabeçalho sticky após navegar à âncora.
  await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: false, animations: "disabled" });
  report.screenshots.push(`${name}.png`);
}
async function anchorVisible(page) {
  try { await page.waitForFunction(() => {
    const element = document.getElementById("checkpoints");
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const expectedScroll = Math.max(0, Math.min(rect.top + scrollY - 96, document.documentElement.scrollHeight - innerHeight));
    // Até 12px acomoda foco/animação curta sem esconder o título sob o header.
    // O defeito de altura tardia deslocava a seção por centenas de pixels.
    return rect.top >= 60 && rect.top < innerHeight - 80 && Math.abs(scrollY - expectedScroll) <= 12;
  }); } catch (error) {
    report.anchorFailureGeometry = await page.evaluate(() => {
      const element = document.getElementById("checkpoints");
      const rect = element?.getBoundingClientRect();
      return { scrollY, innerHeight, scrollHeight: document.documentElement.scrollHeight, section: rect ? { top: rect.top, bottom: rect.bottom, height: rect.height } : null, scrollMarginTop: element ? getComputedStyle(element).scrollMarginTop : null, images: [...document.images].map(image => ({ complete: image.complete, height: image.height })) };
    });
    await shot(page, "falha-ancora");
    throw error;
  }
}
const companies = [
  { id: 91001, razaoSocial: "Empresa Sintética Alfa", cnpj: "12345678000123", regimeTributario: "lucro_real", uf: "SP", cadastroCompleto: true },
  { id: 91002, razaoSocial: "Empresa Sintética Beta", cnpj: "98765432000198", regimeTributario: "lucro_real", uf: "SP", cadastroCompleto: true },
];
const summary = { valorIdentificado: 0, valorCapturavel: 0, valorEmRevisao: 0, totalDespesas: 0, pendenciasRevisao: 0, despesasSemEvidencia: 0, evolucaoPorCategoria: [] };
let alfa;
const beta = { totalCheckpoints: 2, usuarios: [{ colaboradorId: 92002, usuarioId: 93002, nome: "Pessoa Sintética Beta", cargo: "Operadora", checkpoints: 2, jornadas: 1, ultimoCheckpointEm: "2026-09-15T08:00:00.000Z" }] };
async function pageFor({ holdCompany, failCheckpoint = false, viewport = { width: 1440, height: 1000 } } = {}) {
  const context = await browser.newContext({ viewport, locale: "pt-BR", timezoneId: "UTC", serviceWorkers: "block" });
  await context.addInitScript(() => {
    localStorage.setItem("activeCompanyId", "91001");
    localStorage.setItem("onboarding-dismissed:93001", "1");
  });
  const state = { holdCompany, failCheckpoint, calls: [], checkpointCalls: 0 };
  await context.route("**/*", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) {
      report.externalRequestsSuppressed++;
      return route.fulfill({ status: 200, contentType: "text/css", body: "/* recurso externo suprimido no teste */" });
    }
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (!url.pathname.startsWith("/api/trpc/") || request.method() !== "GET") {
      report.unexpectedRequests.push(`${request.method()} ${url.pathname}`);
      return route.fulfill({ status: 503, body: "Unexpected API request blocked" });
    }
    const methods = decodeURIComponent(url.pathname.slice("/api/trpc/".length)).split(",");
    const inputs = JSON.parse(url.searchParams.get("input") ?? "{}");
    const responses = await Promise.all(methods.map(async (method, index) => {
      const input = inputs[index] ? superjson.deserialize(inputs[index]) : undefined;
      const companyId = input?.empresaId;
      state.calls.push({ method, companyId: companyId ?? null });
      if (method === "campo.checkpoints") state.checkpointCalls++;
      if (state.holdCompany && state.holdCompany.id === companyId) await state.holdCompany.gate.wait;
      if (method === "campo.checkpoints" && state.failCheckpoint) {
        return { error: superjson.serialize({ message: "Falha sintética na consulta de checkpoints", code: -32603, data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500, path: method } }) };
      }
      let data;
      switch (method) {
        case "auth.me": data = { id: 93001, nome: "Pessoa Auditora Sintética", email: "auditoria@example.invalid", perfil: "cliente", podeGerenciarEquipe: true, podeRevisarDespesas: true }; break;
        case "empresas.list": data = companies; break;
        case "dashboard.resumo": data = summary; break;
        case "despesas.list": data = []; break;
        case "politica.ativa": data = null; break;
        case "campo.checkpoints":
          assert.ok([91001, 91002].includes(companyId), "Empresa inválida na consulta");
          data = companyId === 91001 ? alfa : beta; break;
        default:
          report.unexpectedRequests.push(method);
          data = null;
      }
      return { result: { data: superjson.serialize(data) } };
    }));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(responses) });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  page.on("pageerror", error => report.browserErrors.push(error.message));
  return { page, context, state };
}

try {
  await mkdir(output, { recursive: true });
  report.sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  report.sourceFingerprint = await fingerprint();
  report.scriptSha256 = createHash("sha256").update(await readFile(fileURLToPath(import.meta.url))).digest("hex");
  // Apenas a função pura de agregação é executada; estado sem jornada/veículo/política.
  const { novoEstadoCampo, checkpointsDoUsuario } = await tsImport(path.join(ROOT, "api/modules/reembolso/campo/dominio.ts"), import.meta.url);
  const presenceState = { ...novoEstadoCampo(), presencas: [{ id: "presence-synthetic-alfa", pontos: [{ id: "checkpoint-synthetic-alfa", tipo: "checkpoint", latitude: -23.55, longitude: -46.63, ocorridoEm: "2026-09-15T07:00:00.000Z", recebidoEm: "2026-09-15T07:00:01.000Z", comandoId: "command-synthetic-alfa", comandoEm: "2026-09-15T06:59:00.000Z" }] }] };
  assert.equal(presenceState.jornadas.length, 0);
  const metrics = checkpointsDoUsuario(presenceState);
  assert.deepEqual(metrics, { checkpoints: 1, jornadas: 1, ultimoCheckpointEm: "2026-09-15T07:00:00.000Z" });
  alfa = { totalCheckpoints: 1, usuarios: [{ colaboradorId: 92001, usuarioId: 93001, nome: "Pessoa Sintética Alfa sem jornada", cargo: null, ...metrics }] };
  await writeFile(path.join(output, "fixture-presenca.json"), JSON.stringify({ synthetic: true, state: presenceState, apiResponse: alfa }, null, 2));
  const temporary = await mkdtemp(path.join(os.tmpdir(), "checkpoints-vite-"));
  // configFile:false evita importar api/boot; envDir vazio evita ler .env reais.
  server = await createServer({ root: ROOT, configFile: false, envDir: temporary, envPrefix: "CHECKPOINT_TEST_PUBLIC_", cacheDir: path.join(temporary, "cache"), plugins: [react()], logLevel: "error", resolve: { alias: { "@": path.join(ROOT, "src"), "@contracts": path.join(ROOT, "contracts"), "@db": path.join(ROOT, "db"), db: path.join(ROOT, "db") } }, server: { host: "127.0.0.1", port: 3208, strictPort: true }, optimizeDeps: { noDiscovery: false } });
  server.middlewares.use("/api", (_req, res) => { res.statusCode = 503; res.end("API disabled for synthetic browser test"); });
  await server.listen();
  const { chromium } = await import(pathToFileURL(process.env.POC_PLAYWRIGHT_MODULE ?? "/root/.local/share/tax-preview/browser/node_modules/playwright/index.mjs").href);
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });

  const delayed = gate();
  const first = await pageFor({ holdCompany: { id: 91001, gate: delayed } });
  await check("URL direta preservada durante respostas lentas, sem falso zero", async () => {
    await first.page.goto(`${origin}/app/dashboard#checkpoints`);
    await first.page.waitForFunction(() => document.body.innerText.includes("Empresa Sintética Alfa"));
    await first.page.waitForTimeout(300);
    assert.ok(first.state.calls.some(call => call.method === "campo.checkpoints"));
    assert.equal(await first.page.locator("#checkpoints").count(), 0);
    assert.equal(await first.page.getByText("Nenhum checkpoint acumulado ainda.").count(), 0);
    assert.ok(first.page.url().endsWith("#checkpoints"));
    await shot(first.page, "01-url-direta-carregando");
    delayed.release();
    await first.page.locator("#checkpoints").getByText("Pessoa Sintética Alfa sem jornada").waitFor();
    await anchorVisible(first.page);
    await shot(first.page, "02-url-direta-carregada");
  });
  await check("Presença sem jornada, veículo ou política aparece no total e na tabela", async () => {
    const section = first.page.locator("#checkpoints");
    assert.equal(await section.getByText("1 total", { exact: true }).count(), 1);
    assert.equal(await section.getByRole("columnheader", { name: "Presenças / jornadas" }).count(), 1);
    const row = section.getByRole("row").filter({ hasText: "Pessoa Sintética Alfa sem jornada" });
    assert.deepEqual(await row.getByRole("cell").allTextContents(), ["Pessoa Sintética Alfa sem jornada", "Não informado", "1", "1", "15/09/2026, 07:00:00"]);
    assert.equal(await first.page.getByText("Sem política ativa", { exact: true }).count(), 1);
  });
  await check("Menu Mais leva à âncora de checkpoints na interface carregada", async () => {
    await first.page.getByRole("link", { name: "Visão geral", exact: true }).click();
    await first.page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await first.page.getByRole("button", { name: "Mais", exact: true }).click();
    await first.page.getByRole("menuitem", { name: "Checkpoints acumulados" }).click();
    await anchorVisible(first.page);
    assert.ok(first.page.url().endsWith("/app/dashboard#checkpoints"));
    await shot(first.page, "03-menu-ancora");
  });
  await check("Troca de empresa oculta Alfa durante carregamento e mostra somente Beta", async () => {
    const betaGate = gate();
    first.state.holdCompany = { id: 91002, gate: betaGate };
    await first.page.getByRole("button", { name: /Empresa Sintética Alfa/ }).click();
    await first.page.getByRole("menuitem", { name: /Empresa Sintética Beta/ }).click();
    await first.page.waitForFunction(() => document.querySelector("header")?.innerText.includes("Empresa Sintética Beta"));
    assert.equal(await first.page.getByText("Pessoa Sintética Alfa sem jornada").count(), 0);
    assert.equal(await first.page.locator("#checkpoints").count(), 0);
    assert.equal(await first.page.getByText("Nenhum checkpoint acumulado ainda.").count(), 0);
    await shot(first.page, "04-troca-beta-carregando");
    betaGate.release();
    await first.page.locator("#checkpoints").getByText("Pessoa Sintética Beta").waitFor();
    assert.equal(await first.page.getByText("Pessoa Sintética Alfa sem jornada").count(), 0);
    assert.equal(await first.page.locator("#checkpoints").getByText("2 total", { exact: true }).count(), 1);
    await anchorVisible(first.page);
    await shot(first.page, "05-troca-beta-carregada");
  });
  await first.context.close();

  const retry = await pageFor({ failCheckpoint: true });
  await check("Falha de checkpoints apresenta erro específico e botão de nova tentativa", async () => {
    await retry.page.goto(`${origin}/app/dashboard#checkpoints`);
    const section = retry.page.locator("#checkpoints");
    await section.getByText("Não foi possível carregar os checkpoints desta empresa.").waitFor();
    assert.equal(await section.getByText("Indisponível", { exact: true }).count(), 1);
    assert.equal(await section.getByText("0 total", { exact: true }).count(), 0);
    assert.equal(await section.getByText("Nenhum checkpoint acumulado ainda.").count(), 0);
    await anchorVisible(retry.page);
    await shot(retry.page, "06-erro-checkpoints");
  });
  await check("Retry mostra carregamento e recupera os dados sem recarregar a página", async () => {
    const retryGate = gate();
    const callsBefore = retry.state.checkpointCalls;
    retry.state.holdCompany = { id: 91001, gate: retryGate };
    retry.state.failCheckpoint = false;
    const section = retry.page.locator("#checkpoints");
    await section.getByRole("button", { name: "Tentar novamente" }).click();
    await section.getByRole("status").waitFor();
    assert.equal(await section.getAttribute("aria-busy"), "true");
    assert.equal(await section.getByText("Nenhum checkpoint acumulado ainda.").count(), 0);
    await shot(retry.page, "07-retry-carregando");
    retryGate.release();
    await section.getByText("Pessoa Sintética Alfa sem jornada").waitFor();
    assert.equal(await section.getAttribute("aria-busy"), "false");
    assert.equal(await section.getByRole("button", { name: "Tentar novamente" }).count(), 0);
    assert.equal(retry.state.checkpointCalls, callsBefore + 1);
    await shot(retry.page, "08-retry-recuperado");
  });
  await retry.context.close();

  await check("Resposta atrasada de Alfa não substitui Beta após a troca de empresa", async () => {
    const oldGate = gate();
    const race = await pageFor({ holdCompany: { id: 91001, gate: oldGate } });
    await race.page.goto(`${origin}/app/dashboard#checkpoints`);
    await race.page.getByRole("button", { name: /Empresa Sintética Alfa/ }).waitFor();
    await race.page.getByRole("button", { name: /Empresa Sintética Alfa/ }).click();
    await race.page.getByRole("menuitem", { name: /Empresa Sintética Beta/ }).click();
    await race.page.locator("#checkpoints").getByText("Pessoa Sintética Beta").waitFor();
    oldGate.release();
    await race.page.waitForTimeout(500);
    assert.equal(await race.page.getByText("Pessoa Sintética Alfa sem jornada").count(), 0);
    assert.equal(await race.page.locator("#checkpoints").getByText("2 total", { exact: true }).count(), 1);
    await shot(race.page, "09-resposta-antiga-isolada");
    await race.context.close();
  });
  await check("Celular mantém link direto, tabela e navegação sem overflow da página", async () => {
    const mobile = await pageFor({ viewport: { width: 390, height: 844 } });
    await mobile.page.goto(`${origin}/app/dashboard#checkpoints`);
    await mobile.page.locator("#checkpoints").getByText("Pessoa Sintética Alfa sem jornada").waitFor();
    await anchorVisible(mobile.page);
    assert.equal(await mobile.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await shot(mobile.page, "10-mobile-ancora");
    const tableScroll = mobile.page.locator("#checkpoints table").locator("..");
    assert.equal(await tableScroll.evaluate(element => element.scrollWidth > element.clientWidth), true);
    await tableScroll.evaluate(element => { element.scrollLeft = element.scrollWidth; });
    assert.equal(await tableScroll.evaluate(element => element.scrollLeft > 0), true);
    await shot(mobile.page, "11-mobile-tabela-fim");
    await mobile.page.getByRole("button", { name: "Abrir menu" }).click();
    await mobile.page.getByRole("link", { name: "Checkpoints acumulados", exact: true }).click();
    assert.equal(await mobile.page.getByRole("dialog", { name: "Menu de navegação" }).count(), 0);
    await anchorVisible(mobile.page);
    await mobile.context.close();
  });
  assert.deepEqual(report.unexpectedRequests, []);
  assert.deepEqual(report.browserErrors, []);
  report.sourceFingerprintAfter = await fingerprint();
  assert.equal(report.sourceFingerprintAfter, report.sourceFingerprint, "Fonte mudou durante o teste; repetir no snapshot estável");
  report.success = true;
} catch (error) {
  report.failure = { phase, message: error.message };
  process.exitCode = 1;
} finally {
  for (const release of activeGates) release();
  if (browser) await browser.close();
  if (server) await server.close();
  report.finishedAt = new Date().toISOString();
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, "resultado.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ output, success: report.success, checks: report.checks.length, failure: report.failure ?? null }));
}

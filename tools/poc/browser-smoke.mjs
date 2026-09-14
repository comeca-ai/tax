import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile, mkdir, writeFile, stat } from "node:fs/promises";
import { spawn, execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createConnection } from "mysql2/promise";
import { tsImport } from "tsx/esm/api";
import { createServer } from "node:net";
import {
  safeDatabase,
  localBrowserRequest,
  TEST_DATABASE,
  TEST_ORIGIN,
} from "./browser-smoke-guards.mjs";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);
// Usage: npm run build && node tools/poc/browser-smoke.mjs
// Requires pre-provisioned, migrated isolated DB; does not run DDL or providers.
// Exercises real browser/application/DB with a session issued by the real helper.
// This is not a password-login test, real WhatsApp test or production acceptance.
const ORIGIN = TEST_ORIGIN;
const DB_NAME = TEST_DATABASE;
const run = randomUUID();
const output = path.join(ROOT, "docs/poc/evidencias", `browser-${run}`);
const ids = {
  usuarios: [],
  empresas: [],
  colaboradores: [],
  politicas_reembolso: [],
  notas_fiscais: [],
  despesas: [],
};
const report = {
  run,
  startedAt: new Date().toISOString(),
  sourceCommit: null,
  origin: ORIGIN,
  database: DB_NAME,
  syntheticOnly: true,
  sessionInjected: true,
  externalRequestsAllowed: false,
  checks: [],
  screenshots: [],
  browserErrors: 0,
  blockedExternalRequests: 0,
  cleanup: false,
  success: false,
};
let db, browser, server;
let serverBytes = 0;
let phase = "prerequisites";

async function databaseUrl() {
  if (process.env.POC_TEST_DATABASE_URL)
    return safeDatabase(process.env.POC_TEST_DATABASE_URL);
  const secretPath = "/root/.config/codex-secrets/poc-test-db.env";
  const metadata = await stat(secretPath);
  assert.equal(metadata.mode & 0o077, 0, "Credential file must be private");
  const contents = await readFile(secretPath, "utf8");
  const value = /^POC_TEST_DATABASE_URL=(.+)$/m.exec(contents)?.[1]?.trim();
  assert.ok(value, "Dedicated test DB configuration missing");
  return safeDatabase(value.replace(/^(['"])(.*)\1$/, "$2"));
}
async function insert(table, columns, values) {
  assert.ok(Object.hasOwn(ids, table));
  const [r] = await db.execute(
    `INSERT INTO ${table} (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`,
    values
  );
  const id = Number(r.insertId);
  assert.ok(Number.isSafeInteger(id) && id > 0);
  ids[table].push(id);
  return id;
}
async function checkpoint(name, action) {
  phase = name;
  await action();
  report.checks.push({ name, passed: true });
}
async function shot(page, name) {
  const filename = `${name}.png`;
  await page.evaluate(() => document.fonts.ready);
  await pause(700); // Await finite Framer Motion transitions before visual evidence.
  await page.screenshot({
    path: path.join(output, filename),
    fullPage: true,
    animations: "disabled",
  });
  report.screenshots.push(filename);
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

try {
  await mkdir(output, { recursive: true });
  report.sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: ROOT,
    encoding: "utf8",
  }).trim();
  report.scriptSha256 = createHash("sha256")
    .update(await readFile(fileURLToPath(import.meta.url)))
    .digest("hex");
  const target = await databaseUrl();
  db = await createConnection(target.href);
  const [names] = await db.query("SELECT DATABASE() AS name");
  assert.equal(names[0].name, DB_NAME);
  // No DDL/migrations: all fixtures are inserted only after the exact DB check.
  phase = "fixtures";
  const uid = await insert(
    "usuarios",
    ["email", "nome", "senha_hash", "perfil"],
    [
      `visual-${run}@example.invalid`,
      "Operador Sintético",
      "fixture-no-password-login",
      "cliente",
    ]
  );
  const companies = [];
  for (const label of ["Alfa", "Beta"]) {
    const empresaId = await insert(
      "empresas",
      [
        "usuario_id",
        "razao_social",
        "cnpj",
        "cnae_principal",
        "regime_tributario",
        "uf",
      ],
      [
        uid,
        `Empresa Sintética ${label}`,
        label === "Alfa" ? "12345678000123" : "98765432000198",
        "4930201",
        "lucro_real",
        "SP",
      ]
    );
    const colaboradorId = await insert(
      "colaboradores",
      ["empresa_id", "nome", "status_vinculo", "status_ativacao"],
      [empresaId, `Colaborador Sintético ${label}`, "ativo", "confirmado"]
    );
    const politicaId = await insert(
      "politicas_reembolso",
      [
        "empresa_id",
        "arquivo_nome",
        "regras",
        "status",
        "versao",
        "created_by_id",
      ],
      [empresaId, "politica-sintetica.txt", "{}", "ativa", 1, uid]
    );
    const notaId = await insert(
      "notas_fiscais",
      ["empresa_id", "arquivo_nome", "valor", "origem"],
      [empresaId, "nota-sintetica.txt", 123.45, "manual"]
    );
    const despesaId = await insert(
      "despesas",
      [
        "empresa_id",
        "nota_fiscal_id",
        "colaborador",
        "categoria",
        "confianca",
        "status",
        "motivo_revisao",
      ],
      [
        empresaId,
        notaId,
        `Colaborador Sintético ${label}`,
        "combustivel",
        "media",
        "em_revisao",
        "Fixture sintética para revisão visual",
      ]
    );
    companies.push({ empresaId, colaboradorId, politicaId, despesaId, label });
  }

  phase = "local-server";
  await stat(path.join(ROOT, "dist/boot.js"));
  report.serverArtifactSha256 = createHash("sha256")
    .update(await readFile(path.join(ROOT, "dist/boot.js")))
    .digest("hex");
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen({ port: 3199, host: "127.0.0.1", exclusive: true }, () =>
      probe.close(resolve)
    );
  });
  // Explicit environment: never inherit operational API keys, URLs or secrets.
  const appSecret = randomBytes(48).toString("hex");
  const cleanEnv = {
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    NODE_ENV: "production",
    APP_ID: "poc-browser-smoke",
    APP_SECRET: appSecret,
    DATABASE_URL: target.href,
    APP_URL: ORIGIN,
    APP_HOST: "127.0.0.1",
    PORT: "3199",
    DOTENV_CONFIG_PATH: "/dev/null",
    WHATSAPP_POC_ENABLED: "false",
    POC_MAPS_ENABLED: "false",
    OCR_PROVIDER: "heuristica",
    POLICY_PROVIDER: "heuristica",
  };
  // The source session helper reads these only at import; no environment file is loaded.
  Object.assign(process.env, {
    APP_SECRET: appSecret,
    APP_ID: cleanEnv.APP_ID,
    DATABASE_URL: target.href,
    DOTENV_CONFIG_PATH: "/dev/null",
  });
  const { criarTokenSessao, SESSION_COOKIE } = await tsImport(
    path.join(ROOT, "api/auth/session.ts"),
    import.meta.url
  );
  server = spawn(process.execPath, [path.join(ROOT, "dist/boot.js")], {
    cwd: ROOT,
    env: cleanEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
  // Count output without persisting messages, SQL, session data or credentials.
  server.stdout.on("data", chunk => {
    serverBytes += chunk.length;
  });
  server.stderr.on("data", chunk => {
    serverBytes += chunk.length;
  });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    assert.equal(
      server.exitCode,
      null,
      "Local application exited before readiness"
    );
    try {
      const response = await fetch(`${ORIGIN}/api/health`, {
        signal: AbortSignal.timeout(500),
      });
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      /* readiness only */
    }
    await pause(100);
  }
  assert.ok(ready, "Local health did not become ready");

  phase = "browser-launch";
  const modulePath =
    process.env.PLAYWRIGHT_CORE_PATH ??
    "/root/.local/share/tax-preview/browser/node_modules/playwright-core/index.mjs";
  const { chromium } = await import(pathToFileURL(modulePath).href);
  browser = await chromium.launch({
    executablePath:
      process.env.CHROMIUM_PATH ??
      "/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome",
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-background-networking",
      "--disable-component-update",
    ],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: "block",
  });
  await context.routeWebSocket("**/*", socket => socket.close());
  await context.route("**/*", route => {
    if (localBrowserRequest(route.request().url())) return route.continue();
    report.blockedExternalRequests++;
    return route.abort("blockedbyclient");
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  page.on("pageerror", () => {
    report.browserErrors++;
  });

  await checkpoint("anonymous-protected-route", async () => {
    await page.goto(`${ORIGIN}/app/campo`);
    await page.waitForURL("**/login**");
    await shot(page, "01-login-anonimo");
  });
  await context.addCookies([
    {
      name: SESSION_COOKIE,
      value: criarTokenSessao(uid, "fixture-no-password-login"),
      url: ORIGIN,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.evaluate(
    id => window.localStorage.setItem("activeCompanyId", String(id)),
    companies[0].empresaId
  );
  await checkpoint("dashboard-authenticated", async () => {
    await page.goto(`${ORIGIN}/app/dashboard`);
    await page
      .getByRole("navigation", { name: "Navegação principal" })
      .waitFor();
    await page
      .getByRole("main")
      .getByText("Empresa Sintética Alfa", { exact: false })
      .first()
      .waitFor();
    await shot(page, "02-dashboard");
  });
  await checkpoint("review-queue-and-detail", async () => {
    await page.goto(`${ORIGIN}/app/revisao`);
    await page
      .getByRole("main")
      .getByText("Colaborador Sintético Alfa", { exact: false })
      .first()
      .waitFor();
    await page
      .getByText("Despesa #" + companies[0].despesaId, { exact: false })
      .first()
      .waitFor();
    await shot(page, "03-fila-detalhe");
  });
  await checkpoint("policy-active", async () => {
    await page.goto(`${ORIGIN}/app/politica`);
    await page
      .getByRole("main")
      .getByText("Política ativa · v1", { exact: false })
      .first()
      .waitFor();
    await shot(page, "04-politica");
  });
  await checkpoint("policy-upload-empty", async () => {
    await page.goto(`${ORIGIN}/app/politica/nova`);
    await page
      .getByText("Arraste o documento da política aqui", { exact: false })
      .waitFor();
    await shot(page, "05-upload");
  });
  await checkpoint("field-tenant-selection", async () => {
    await page.goto(`${ORIGIN}/app/campo`);
    await page
      .getByLabel("Colaborador da empresa ativa")
      .selectOption(String(companies[0].colaboradorId));
    await page
      .getByRole("heading", { name: "Jornadas e cálculo posterior" })
      .waitFor();
    assert.equal(
      await page
        .getByLabel("Colaborador da empresa ativa")
        .locator("option", { hasText: "Beta" })
        .count(),
      0
    );
    await shot(page, "06-campo");
  });
  await checkpoint("company-switch-clears-person", async () => {
    await page.getByRole("button", { name: /Empresa Sintética Alfa/ }).click();
    await page
      .getByRole("menuitem", { name: /Empresa Sintética Beta/ })
      .click();
    await page
      .getByLabel("Colaborador da empresa ativa")
      .locator("option", { hasText: "Colaborador Sintético Beta" })
      .waitFor({ state: "attached" });
    assert.equal(
      await page.getByLabel("Colaborador da empresa ativa").inputValue(),
      ""
    );
    assert.equal(
      await page
        .getByLabel("Colaborador da empresa ativa")
        .locator("option", { hasText: "Alfa" })
        .count(),
      0
    );
    await page
      .getByLabel("Colaborador da empresa ativa")
      .selectOption(String(companies[1].colaboradorId));
    await page
      .getByRole("heading", { name: "Jornadas e cálculo posterior" })
      .waitFor();
    await shot(page, "07-troca-empresa");
  });
  await checkpoint("mobile-layout-menu", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Abrir menu" }).click();
    await page.getByRole("dialog", { name: "Menu de navegação" }).waitFor();
    await shot(page, "08-menu-mobile");
    await page
      .getByRole("dialog", { name: "Menu de navegação" })
      .getByRole("link", { name: "Campo e conciliação" })
      .click();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1
      ),
      "Horizontal overflow"
    );
    await shot(page, "09-campo-mobile");
  });
  assert.equal(report.browserErrors, 0, "Browser runtime errors occurred");
  report.success = true;
} catch (error) {
  report.failure = { phase, kind: error?.constructor?.name ?? "Error" };
  if (/^(EACCES|EPERM|ECONNREFUSED|EADDRINUSE)$/.test(error?.code ?? ""))
    report.failure.code = error.code;
  if (
    /operation not permitted|permission denied|sandbox/i.test(
      error?.message ?? ""
    )
  )
    report.failure.permissionRelated = true;
  // Deliberately do not print the error/cause: database errors can contain SQL values.
  process.exitCode = 1;
} finally {
  try {
    await browser?.close();
  } catch {
    /* cleanup continues */
  }
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await Promise.race([
      new Promise(resolve => server.once("exit", resolve)),
      pause(3000),
    ]);
    if (server.exitCode === null) server.kill("SIGKILL");
  }
  if (db) {
    try {
      for (const table of [
        "despesas",
        "notas_fiscais",
        "politicas_reembolso",
        "colaboradores",
        "empresas",
        "usuarios",
      ]) {
        if (!ids[table].length) continue;
        await db.execute(
          `DELETE FROM ${table} WHERE id IN (${ids[table].map(() => "?").join(",")})`,
          ids[table]
        );
      }
      report.cleanup = true;
    } catch {
      report.cleanup = false;
      report.cleanupIds = ids;
      process.exitCode = 1;
    } finally {
      await db.end();
    }
  }
  report.serverOutputBytesSuppressed = serverBytes;
  report.success = report.success && report.cleanup;
  report.finishedAt = new Date().toISOString();
  await mkdir(output, { recursive: true });
  await writeFile(
    path.join(output, "report.json"),
    JSON.stringify(report, null, 2)
  );
  process.stdout.write(
    JSON.stringify({
      success: report.success,
      phase: report.failure?.phase ?? "complete",
      checks: report.checks.length,
      screenshots: report.screenshots.length,
      cleanup: report.cleanup,
      report: path.relative(ROOT, path.join(output, "report.json")),
    }) + "\n"
  );
}

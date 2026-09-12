/**
 * Runner do orquestrador de varredura/auditoria.
 *
 * Uso: `pnpm audit:run`
 *
 * Executa todos os scanners sobre a raiz do repositório e grava os
 * relatórios em `docs/auditoria/` (Markdown + JSON agregado).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanBranches } from "./scanners/branches";
import { scanEntities } from "./scanners/entities";
import { scanFeatures } from "./scanners/features";
import { scanIntegrations } from "./scanners/integrations";
import { scanScreens } from "./scanners/screens";
import { scanHistory } from "./scanners/history";
import { renderReports } from "./reporters/markdown";
import { ensureDir, writeText } from "./utils/fs";
import type { AuditResult } from "./types";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const outDir = path.join(root, "docs", "auditoria");

export async function runAudit(repoRoot = root): Promise<AuditResult> {
  const [branches, entities, features, integrations, screens, history] =
    await Promise.all([
      scanBranches(repoRoot),
      scanEntities(repoRoot),
      scanFeatures(repoRoot),
      scanIntegrations(repoRoot),
      scanScreens(repoRoot),
      scanHistory(repoRoot),
    ]);

  return {
    generatedAt: new Date().toISOString(),
    branches,
    entities,
    features,
    integrations,
    screens,
    history,
  };
}

async function main(): Promise<void> {
  const result = await runAudit();
  await ensureDir(outDir);

  const reports = renderReports(result);
  for (const [name, content] of reports) {
    const written = await writeText(path.join(outDir, name), content);
    console.log(`✔ ${path.relative(root, written)}`);
  }

  const jsonPath = await writeText(
    path.join(outDir, "audit-summary.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(`✔ ${path.relative(root, jsonPath)}`);
  console.log(
    `\nVarredura concluída: ${result.branches.length} branches, ` +
      `${result.entities.length} entidades, ${result.features.length} funcionalidades, ` +
      `${result.integrations.length} sinais de integração, ${result.screens.length} telas.`,
  );
}

// Só executa quando chamado diretamente (não em import por testes).
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((err) => {
    console.error("Falha na auditoria:", err);
    process.exitCode = 1;
  });
}

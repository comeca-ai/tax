import { mdHeader, mdTable } from "../utils/markdown";
import type { AuditResult } from "../types";

/**
 * Renderiza os relatórios Markdown da auditoria.
 * Retorna um mapa nome-de-arquivo → conteúdo, consumido pelo runner.
 */
export function renderReports(result: AuditResult): Map<string, string> {
  const reports = new Map<string, string>();
  const at = result.generatedAt;

  reports.set(
    "01-branches.md",
    mdHeader("01 · Branches", at) +
      mdTable(
        ["Branch", "Origem", "Atual"],
        result.branches.map((b) => [
          b.name,
          b.source,
          b.current ? "✅" : "",
        ]),
      ) +
      "\n",
  );

  reports.set(
    "02-entidades.md",
    mdHeader("02 · Entidades", at) +
      mdTable(
        ["Entidade", "Arquivo", "Linha"],
        result.entities.map((e) => [e.name, e.file, String(e.line)]),
      ) +
      "\n",
  );

  reports.set(
    "03-funcionalidades.md",
    mdHeader("03 · Funcionalidades (routers tRPC)", at) +
      mdTable(
        ["Funcionalidade", "Arquivo", "Procedures"],
        result.features.map((f) => [f.name, f.file, String(f.procedures)]),
      ) +
      "\n",
  );

  reports.set(
    "04-integracoes.md",
    mdHeader("04 · Integrações detectadas", at) +
      mdTable(
        ["Domínio", "Termo", "Arquivo", "Ocorrências"],
        result.integrations.map((i) => [
          i.domain,
          i.term,
          i.file,
          String(i.occurrences),
        ]),
      ) +
      "\n",
  );

  reports.set(
    "05-telas.md",
    mdHeader("05 · Telas e rotas", at) +
      mdTable(
        ["Rota", "Componente", "Protegida"],
        result.screens.map((s) => [
          s.path,
          s.component,
          s.protected ? "sim" : "não",
        ]),
      ) +
      "\n",
  );

  reports.set(
    "06-historico.md",
    mdHeader("06 · Histórico relevante", at) +
      mdTable(
        ["Commit", "Assunto"],
        result.history.map((h) => [h.hash, h.subject]),
      ) +
      "\n",
  );

  return reports;
}

/**
 * Utilitários mínimos para gerar Markdown consistente nos relatórios.
 * Escapamos `|` nas células para não quebrar tabelas quando os dados
 * vêm de conteúdo livre (ex.: assunto de commit).
 */

/** Escapa caracteres que quebram células de tabela Markdown. */
export function mdCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

/** Monta uma tabela Markdown a partir de cabeçalhos e linhas. */
export function mdTable(headers: string[], rows: string[][]): string {
  const head = `| ${headers.map(mdCell).join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((r) => `| ${r.map(mdCell).join(" | ")} |`).join("\n");
  return [head, sep, body].join("\n");
}

/** Cabeçalho padrão de um relatório de auditoria. */
export function mdHeader(title: string, generatedAt: string): string {
  return [
    `# ${title}`,
    "",
    `> Gerado automaticamente pelo orquestrador em ${generatedAt}.`,
    "> Não editar manualmente — rode `pnpm audit:run` para regenerar.",
    "",
  ].join("\n");
}

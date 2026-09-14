import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
it("migração fiscal é aditiva, desligada e sem alocação de orçamento", () => {
  const sql = readFileSync(
    new URL("./migrations/0021_verificacao_fiscal.sql", import.meta.url),
    "utf8"
  );
  expect(sql).not.toMatch(/\b(?:DROP|DELETE|INSERT|ALTER|TRUNCATE)\b/i);
  expect(sql).toContain("`habilitada` boolean NOT NULL DEFAULT false");
  expect(sql.match(/CREATE TABLE/g)).toHaveLength(3);
  expect(sql).not.toContain("API_NFE_IO");
  expect(sql).not.toMatch(/INSERT\s+INTO\s+`?nfe_io_orcamentos/i);
  const rollback = readFileSync(
    new URL(
      "./migrations/rollback/0021_verificacao_fiscal.sql",
      import.meta.url
    ),
    "utf8"
  );
  expect(rollback.match(/DROP TABLE IF EXISTS `fiscal_/g)).toHaveLength(3);
});

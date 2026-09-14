import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
it("migração NFE.io é aditiva e não cria verba/crédito para consultas", () => {
  const sql = readFileSync(
    new URL("./migrations/0017_nfe_io_consultas.sql", import.meta.url),
    "utf8"
  );
  expect(sql).not.toMatch(/\b(?:DROP|DELETE|UPDATE|INSERT|MODIFY|TRUNCATE)\b/i);
  expect(sql.match(/CREATE TABLE/g)).toHaveLength(2);
  expect(sql).toContain("`limite` int unsigned NOT NULL DEFAULT 0");
  expect(sql).toContain("`chave_hash` varchar(64)");
  expect(sql).not.toMatch(/`(?:api_key|authorization|xml|raw|chave_acesso)`/i);
});

import { describe, expect, it } from "vitest";
import { parseEntities } from "./entities";

const SCHEMA = `
import { mysqlTable, serial, varchar } from "drizzle-orm/mysql-core";

export const usuarios = mysqlTable("usuarios", {
  id: serial("id").primaryKey(),
});

export const despesas = mysqlTable("despesas", {
  id: serial("id").primaryKey(),
  descricao: varchar("descricao", { length: 255 }),
});
`;

describe("parseEntities", () => {
  it("extrai tabelas Drizzle com nome, arquivo e linha", () => {
    const items = parseEntities(SCHEMA, "db/schema.ts");
    expect(items).toEqual([
      { name: "usuarios", file: "db/schema.ts", line: 4 },
      { name: "despesas", file: "db/schema.ts", line: 8 },
    ]);
  });

  it("ignora exports que não são tabelas", () => {
    const items = parseEntities('export const x = 1;\n', "a.ts");
    expect(items).toEqual([]);
  });
});

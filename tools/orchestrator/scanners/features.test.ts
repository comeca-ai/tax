import { describe, expect, it } from "vitest";
import { parseFeatures } from "./features";

const ROUTER = `
import { createRouter, publicQuery } from "./middleware";
import { authRouter } from "./routers/auth";
import { despesasRouter } from "./routers/despesas";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true })),
  auth: authRouter,
  despesas: despesasRouter,
});
`;

const DESPESAS = `
export const despesasRouter = router({
  listar: protectedProcedure.query(() => []),
  criar: protectedProcedure.mutation(() => ({})),
});
`;

describe("parseFeatures", () => {
  it("mapeia chaves do appRouter para arquivos e conta procedures", () => {
    const files = new Map([
      ["api/routers/auth.ts", ""],
      ["api/routers/despesas.ts", DESPESAS],
    ]);
    const items = parseFeatures(ROUTER, files);
    expect(items).toEqual([
      { name: "auth", file: "api/routers/auth.ts", procedures: 0 },
      { name: "despesas", file: "api/routers/despesas.ts", procedures: 2 },
    ]);
  });

  it("ignora entradas sem import correspondente (ex.: ping inline)", () => {
    const items = parseFeatures(ROUTER, new Map());
    expect(items.map((i) => i.name)).toEqual(["auth", "despesas"]);
  });
});

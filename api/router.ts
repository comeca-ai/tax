import { createRouter, publicQuery } from "./middleware";
import { authRouter } from "./routers/auth";
import { empresasRouter } from "./routers/empresas";
import { veiculosRouter } from "./routers/veiculos";
import { despesasRouter } from "./routers/despesas";
import { revisaoRouter } from "./routers/revisao";
import { dashboardRouter, relatoriosRouter } from "./routers/dashboard";
import { regrasRouter } from "./routers/regras";
import { politicaRouter } from "./routers/politica";
import { convitesRouter } from "./routers/convites";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  empresas: empresasRouter,
  veiculos: veiculosRouter,
  despesas: despesasRouter,
  revisao: revisaoRouter,
  dashboard: dashboardRouter,
  relatorios: relatoriosRouter,
  regras: regrasRouter,
  politica: politicaRouter,
  convites: convitesRouter,
});

export type AppRouter = typeof appRouter;

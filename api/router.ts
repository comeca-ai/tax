import { metricasPocRouter } from "./routers/metricasPoc";
import { createRouter, publicQuery } from "./middleware";
import { equipeLoteRouter } from "./routers/equipeLote";
import { authRouter } from "./routers/auth";
import { empresasRouter } from "./modules/empresas";
import { despesasRouter } from "./routers/despesas";
import { revisaoRouter } from "./routers/revisao";
import { dashboardRouter, relatoriosRouter } from "./routers/dashboard";
import { regrasRouter } from "./routers/regras";
import { politicaRouter } from "./routers/politica";
import { convitesRouter } from "./routers/convites";
import { colaboradoresRouter } from "./routers/colaboradores";
import { campoRouter } from "./routers/campo";
import { veiculosRouter } from "./routers/veiculos";
import { nfeIoRouter } from "./routers/nfeio";
import { fiscalRouter } from "./routers/fiscal";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  empresas: empresasRouter,
  despesas: despesasRouter,
  revisao: revisaoRouter,
  dashboard: dashboardRouter,
  relatorios: relatoriosRouter,
  regras: regrasRouter,
  politica: politicaRouter,
  convites: convitesRouter,
  colaboradores: colaboradoresRouter,
  equipeLote: equipeLoteRouter,
  campo: campoRouter,
  metricasPoc: metricasPocRouter,
  nfeio: nfeIoRouter,
  fiscal: fiscalRouter,
  veiculos: veiculosRouter,
});

export type AppRouter = typeof appRouter;

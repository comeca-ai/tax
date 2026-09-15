import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import MetricasPoc from "./MetricasPoc";
import { periodoMetricas } from "./periodo";
const state = vi.hoisted(() => ({
  user: { id: 7, perfil: "cliente", nome: "Auditor" },
  loading: false,
  error: false,
  query: vi.fn(),
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: state.user, isLoading: false }),
}));
vi.mock("@/providers/trpc", () => ({
  trpc: {
    metricasPoc: {
      resumo: {
        useQuery: (...args: unknown[]) => {
          state.query(...args);
          return {
            isLoading: state.loading,
            error: state.error,
            data: undefined,
            refetch: vi.fn(),
          };
        },
      },
      auditarAmostra: { useMutation: () => ({ isPending: false }) },
    },
    campo: {
      registrarPagamento: { useMutation: () => ({ isPending: false }) },
    },
  },
}));
const render = (de = "2026-09-01", ate = "2026-09-15") =>
  renderToStaticMarkup(
    <MetricasPoc empresa={{ id: 42, usuarioId: 7 }} de={de} ate={ate} />
  );
beforeEach(() => {
  state.user.id = 7;
  state.loading = false;
  state.error = false;
  state.query.mockClear();
});
it("usa período UTC inclusivo na tela e fim exclusivo na consulta", () => {
  expect(periodoMetricas("2026-09-01", "2026-09-15")).toEqual({
    inicio: "2026-09-01T00:00:00.000Z",
    fim: "2026-09-16T00:00:00.000Z",
  });
  render();
  expect(state.query.mock.calls[0][0]).toMatchObject({
    empresaId: 42,
    fim: "2026-09-16T00:00:00.000Z",
  });
});
it("datas impossíveis e invertidas bloqueiam consulta e formulário", () => {
  expect(render("2026-02-30")).toContain("período válido");
  expect(render("2026-09-20")).toContain("período válido");
  expect(state.query).not.toHaveBeenCalled();
});
it("não consulta nem apresenta registro para outra empresa", () => {
  state.user.id = 9;
  const html = render();
  expect(html).toContain("administrador da empresa");
  expect(html).not.toContain("<form");
  expect(state.query).not.toHaveBeenCalled();
});
it("expõe carregamento, erro com repetição e formulários com evidência/autoria", () => {
  state.loading = true;
  expect(render()).toContain("Carregando métricas");
  state.loading = false;
  state.error = true;
  const html = render();
  expect(html).toContain("Tentar novamente");
  expect(html).toContain("Evidência e referência");
  expect(html).toContain("Auditor");
  expect(html).toContain("Pago em (horário local)");
});

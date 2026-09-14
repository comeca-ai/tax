import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import ConfiguracaoFiscal from "./ConfiguracaoFiscal";
const state = vi.hoisted(() => ({
  habilitada: false,
  podeAlterar: true,
  error: false,
  mutate: vi.fn(),
}));
vi.mock("@/providers/trpc", () => ({
  trpc: {
    useUtils: () => ({ fiscal: { configuracao: { invalidate: vi.fn() } } }),
    fiscal: {
      configuracao: {
        useQuery: () => ({
          data: state.error
            ? undefined
            : {
                empresaId: 1,
                habilitada: state.habilitada,
                versao: 0,
                podeAlterar: state.podeAlterar,
                historico: [],
                alteradaEm: null,
              },
          isLoading: false,
          isError: state.error,
        }),
      },
      configurar: {
        useMutation: () => ({
          mutate: state.mutate,
          isPending: false,
          isError: false,
        }),
      },
    },
  },
}));
beforeEach(() => {
  state.habilitada = false;
  state.podeAlterar = true;
  state.error = false;
  state.mutate.mockClear();
});
const render = () => renderToStaticMarkup(<ConfiguracaoFiscal empresaId={1} />);
it("carrega desligado e informa etapa/cobertura sem ativar por montagem", () => {
  const html = render();
  expect(html).toContain("Verificar autenticidade fiscal da nota");
  expect(html).toContain("Desativada para esta empresa");
  expect(html).not.toContain('checked=""');
  expect(html).toContain("antes da decisão");
  expect(html).toContain("modelo 65");
  expect(state.mutate).not.toHaveBeenCalled();
});
it("colaborador visualiza opção mas não recebe controle editável", () => {
  state.podeAlterar = false;
  expect(render()).toContain('disabled=""');
  expect(render()).toContain("exclusiva do administrador");
});
it("erro de leitura não se apresenta como opção desativada salva", () => {
  state.error = true;
  expect(render()).toContain('role="alert"');
  expect(render()).not.toContain('type="checkbox"');
  expect(render()).not.toContain("Desativada para esta empresa");
});

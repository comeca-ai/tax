import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { beforeEach, expect, it, vi } from "vitest";
import ConfiguracaoCampo from "./ConfiguracaoCampo";

const state = vi.hoisted(() => ({
  ativa: null as { id: number; versao: number } | null,
  error: false,
  mutate: vi.fn(),
  pessoas: [] as {
    id: number;
    empresaId: number;
    nome: string;
    statusVinculo: string;
  }[],
}));
vi.mock("@/providers/trpc", () => ({
  trpc: {
    useUtils: () => ({ campo: { configuracao: { invalidate: vi.fn() } } }),
    colaboradores: {
      listar: {
        useQuery: () => ({
          data: state.pessoas,
          isLoading: false,
          isError: false,
        }),
      },
    },
    politica: {
      ativa: {
        useQuery: () => ({
          data: state.ativa,
          isLoading: false,
          isError: state.error,
          refetch: vi.fn(),
        }),
      },
    },
    campo: {
      configuracao: {
        useQuery: () => ({
          data: { configuracao: null },
          isLoading: false,
          isError: false,
          refetch: vi.fn(),
        }),
      },
      configurar: {
        useMutation: () => ({
          mutate: state.mutate,
          isError: false,
          isPending: false,
        }),
      },
    },
  },
}));
beforeEach(() => {
  state.ativa = null;
  state.pessoas = [];
  state.error = false;
  state.mutate.mockClear();
});
const render = () =>
  renderToStaticMarkup(
    <MemoryRouter>
      <ConfiguracaoCampo empresaId={2} />
    </MemoryRouter>
  );

it("sem política ativa não permite configurar parâmetros", () => {
  const html = render();
  expect(html).toContain("antes de configurar campo");
  expect(html).not.toContain("Salvar parâmetros");
  expect(state.mutate).not.toHaveBeenCalled();
});
it("não inventa tarifa ou modo na primeira configuração", () => {
  state.ativa = { id: 5, versao: 3 };
  const html = render();
  expect(html).toContain("política ativa v3");
  expect(html).toContain("Selecione explicitamente");
  expect(html).toContain('value=""');
  expect(html).toContain('disabled=""');
  expect(state.mutate).not.toHaveBeenCalled();
});
it("falha ao consultar política não apresenta formulário de ativação", () => {
  state.error = true;
  expect(render()).toContain("Parâmetros de campo indisponíveis");
  expect(render()).not.toContain("Salvar parâmetros");
});

it("configuração oferece tarifas por UF e designação somente da empresa", () => {
  state.ativa = { id: 5, versao: 3 };
  state.pessoas = [
    { id: 1, empresaId: 2, nome: "Pessoa local", statusVinculo: "ativo" },
    { id: 2, empresaId: 99, nome: "Pessoa externa", statusVinculo: "ativo" },
  ];
  const html = render();
  expect(html).toContain("Tarifas por UF");
  expect(html).toContain("Possui vale refeição");
  expect(html).toContain("Pessoa local");
  expect(html).not.toContain("Pessoa externa");
  expect(state.mutate).not.toHaveBeenCalled();
});

import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { beforeEach, expect, it, vi } from "vitest";
import Campo from "./Campo";

const state = vi.hoisted(() => ({
  empresa: { id: 2, usuarioId: 7, cnpj: "12345678000190" },
  user: { id: 7, perfil: "cliente" },
  loading: false,
  error: false,
  pessoas: [] as {
    id: number;
    empresaId: number;
    nome: string;
    statusVinculo: string;
  }[],
  consultar: vi.fn(),
  configurar: vi.fn(),
}));
vi.mock("@/hooks/useActiveCompany", () => ({
  useActiveCompany: () => ({
    activeCompany: state.empresa,
    isLoading: state.loading,
  }),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock("@/components/campo/ConfiguracaoCampo", () => ({
  default: () => <span>Parâmetros</span>,
}));
vi.mock("@/providers/trpc", () => ({
  trpc: {
    colaboradores: {
      listar: {
        useQuery: () => ({
          isError: state.error,
          isLoading: false,
          data: state.pessoas,
          refetch: vi.fn(),
        }),
      },
    },
    campo: { consultar: { useQuery: state.consultar } },
  },
}));
const render = () =>
  renderToStaticMarkup(
    <MemoryRouter>
      <Campo />
    </MemoryRouter>
  );
beforeEach(() => {
  state.user = { id: 7, perfil: "cliente" };
  state.error = false;
  state.loading = false;
  state.pessoas = [];
  state.consultar.mockClear();
});
it("impede acesso administrativo quando troca para empresa que não administra", () => {
  state.user.id = 8;
  expect(render()).toContain("Somente o administrador");
  expect(state.consultar).not.toHaveBeenCalled();
});
it("filtra opções por tenant e não consulta uma pessoa automaticamente", () => {
  state.pessoas = [
    { id: 1, empresaId: 2, nome: "Pessoa permitida", statusVinculo: "ativo" },
    { id: 2, empresaId: 3, nome: "Outra empresa", statusVinculo: "ativo" },
  ];
  const html = render();
  expect(html).toContain("Pessoa permitida");
  expect(html).not.toContain("Outra empresa");
  expect(state.consultar).not.toHaveBeenCalled();
});
it("falha de API mostra erro e não afirma ausência de dados", () => {
  state.error = true;
  const html = render();
  expect(html).toContain("Colaboradores indisponíveis");
  expect(html).not.toContain("Cadastre colaboradores");
});
it("sem pessoas mostra estado vazio orientado ao cadastro", () => {
  expect(render()).toContain("Cadastre colaboradores");
  expect(state.consultar).not.toHaveBeenCalled();
});

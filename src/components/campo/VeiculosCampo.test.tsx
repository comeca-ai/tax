import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import VeiculosCampo from "./VeiculosCampo";
const state = vi.hoisted(() => ({ error: false, mutate: vi.fn() }));
vi.mock("@/providers/trpc", () => ({
  trpc: {
    useUtils: () => ({ veiculos: { listar: { invalidate: vi.fn() } } }),
    veiculos: {
      listar: {
        useQuery: () => ({
          isError: state.error,
          isLoading: false,
          refetch: vi.fn(),
          data: [
            {
              id: 1,
              empresaId: 2,
              colaboradorId: 3,
              placa: "ABC1234",
              ufLicenciamento: "SP",
              kmPorLitroDeclarado: 10,
            },
            {
              id: 2,
              empresaId: 4,
              colaboradorId: 3,
              placa: "XYZ9876",
              ufLicenciamento: "RJ",
              kmPorLitroDeclarado: 8,
            },
            {
              id: 3,
              empresaId: 2,
              colaboradorId: 9,
              placa: "DEF5678",
              ufLicenciamento: "MG",
              kmPorLitroDeclarado: 9,
            },
          ],
        }),
      },
      salvar: {
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
  state.error = false;
  state.mutate.mockClear();
});
it("mostra somente veículos da pessoa na empresa selecionada", () => {
  const html = renderToStaticMarkup(
    <VeiculosCampo empresaId={2} colaboradorId={3} ativo />
  );
  expect(html).toContain("ABC1234");
  expect(html).not.toContain("XYZ9876");
  expect(html).not.toContain("DEF5678");
  expect(html).toContain("RENAVAM");
  expect(html).toContain("Motorização");
  expect(html).toContain("UF de licenciamento");
  expect(state.mutate).not.toHaveBeenCalled();
});
it("bloqueia cadastro para vínculo suspenso", () => {
  const html = renderToStaticMarkup(
    <VeiculosCampo empresaId={2} colaboradorId={3} ativo={false} />
  );
  expect(html).toMatch(/<button[^>]*disabled=""/);
});
it("erro na API não exibe lista anterior como resultado confirmado", () => {
  state.error = true;
  const html = renderToStaticMarkup(
    <VeiculosCampo empresaId={2} colaboradorId={3} ativo />
  );
  expect(html).toContain("Não foi possível consultar");
  expect(html).not.toContain("ABC1234");
});

import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Outlet } from "react-router";
import { beforeEach, expect, it, vi } from "vitest";
import App from "@/App";

const sessao = vi.hoisted(() => ({ allowed: false, loading: false }));
vi.mock("react-router", async original => ({
  ...(await original<typeof import("react-router")>()),
  Navigate: ({ to }: { to: string }) => <i data-redirect={to} />,
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: 1, perfil: "cliente" },
    isAuthenticated: true,
    isLoading: sessao.loading,
    podeGerenciarEquipe: sessao.allowed,
  }),
}));
vi.mock("@/components/app/AppShell", () => ({ default: () => <Outlet /> }));
vi.mock("@/pages/app/Campo", () => ({
  default: () => <div data-pagina="campo" />,
}));
beforeEach(() => {
  sessao.allowed = false;
  sessao.loading = false;
});
const render = () =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={["/app/campo"]}>
      <App />
    </MemoryRouter>
  );
it("rota Campo exige permissão de equipe do servidor", () => {
  expect(render()).toContain('data-redirect="/app/dashboard"');
  expect(render()).not.toContain('data-pagina="campo"');
});
it("administrador de equipe entra na rota protegida", () => {
  sessao.allowed = true;
  expect(render()).toContain('data-pagina="campo"');
});
it("não renderiza campo enquanto sessão está carregando", () => {
  sessao.loading = true;
  expect(render()).not.toContain('data-pagina="campo"');
});

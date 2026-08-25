import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Outlet } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Perfil } from "@contracts/types";
import App from "@/App";
import RequireAdmin from "./RequireAdmin";

/**
 * Guarda de perfil de /app/regras e /app/equipe (v1.8.0).
 *
 * O teste entra pela ÁRVORE DE ROTAS de `App.tsx`, não só pelo componente: o que
 * quebra na vida real é a rota sair de dentro de `<Route element={<RequireAdmin />}>`,
 * e um teste que monta a guarda sozinha passaria feliz com a rota desprotegida.
 *
 * Sem DOM, `<Navigate>` não mexe no histórico — o redirect dele mora num efeito, que
 * não roda em render de servidor. Por isso `Navigate` vira uma sonda que expõe o
 * destino no markup; é a intenção de redirecionar que está sob teste, não o
 * react-router. As páginas e o `AppShell` viram marcadores porque puxam tRPC.
 */

const sessao = vi.hoisted(() => ({
  perfil: "admin" as Perfil | null,
  isLoading: false,
}));

vi.mock("react-router", async importOriginal => {
  const real = await importOriginal<typeof import("react-router")>();
  return {
    ...real,
    Navigate: ({ to, replace }: { to: string; replace?: boolean }) => (
      <i data-redirecionou-para={to} data-replace={replace ? "sim" : "nao"} />
    ),
  };
});

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: sessao.perfil === null ? null : { perfil: sessao.perfil },
    isLoading: sessao.isLoading,
    isAuthenticated: sessao.perfil !== null,
    perfil: sessao.perfil,
    logout: async () => {},
  }),
}));

vi.mock("@/components/app/AppShell", () => ({ default: () => <Outlet /> }));
vi.mock("@/pages/app/Regras", () => ({ default: () => <div data-pagina="regras" /> }));
vi.mock("@/pages/app/Equipe", () => ({ default: () => <div data-pagina="equipe" /> }));
vi.mock("@/pages/app/Dashboard", () => ({ default: () => <div data-pagina="dashboard" /> }));

function abrir(rota: string, perfil: Perfil): string {
  sessao.perfil = perfil;
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[rota]}>
      <App />
    </MemoryRouter>
  );
}

const REDIRECT_DASHBOARD = '<i data-redirecionou-para="/app/dashboard" data-replace="sim">';

beforeEach(() => {
  sessao.perfil = "admin";
  sessao.isLoading = false;
});

describe("área restrita ao time da plataforma", () => {
  it("cliente não vê Regras & Matriz e volta para o dashboard", () => {
    const html = abrir("/app/regras", "cliente");
    expect(html).not.toContain('data-pagina="regras"');
    expect(html).toContain(REDIRECT_DASHBOARD);
  });

  it("cliente não vê Equipe e volta para o dashboard", () => {
    const html = abrir("/app/equipe", "cliente");
    expect(html).not.toContain('data-pagina="equipe"');
    expect(html).toContain(REDIRECT_DASHBOARD);
  });

  it("revisor é barrado nas duas rotas, igual ao cliente", () => {
    const regras = abrir("/app/regras", "revisor");
    expect(regras).not.toContain('data-pagina="regras"');
    expect(regras).toContain(REDIRECT_DASHBOARD);

    const equipe = abrir("/app/equipe", "revisor");
    expect(equipe).not.toContain('data-pagina="equipe"');
    expect(equipe).toContain(REDIRECT_DASHBOARD);
  });

  it("admin vê Regras & Matriz", () => {
    const html = abrir("/app/regras", "admin");
    expect(html).toContain('data-pagina="regras"');
    expect(html).not.toContain("data-redirecionou-para");
  });

  it("admin vê Equipe", () => {
    const html = abrir("/app/equipe", "admin");
    expect(html).toContain('data-pagina="equipe"');
    expect(html).not.toContain("data-redirecionou-para");
  });

  // Enquanto a sessão carrega o perfil ainda é null; redirecionar aqui tiraria o
  // admin da própria página no primeiro frame. Vai direto no componente porque, na
  // árvore de rotas, o loader do RequireAuth chega antes com o mesmo `isLoading`.
  it("enquanto carrega, mostra o loader e não redireciona ninguém", () => {
    sessao.perfil = null;
    sessao.isLoading = true;
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <RequireAdmin />
      </MemoryRouter>
    );
    expect(html).toContain("Verificando permissão");
    expect(html).not.toContain("data-redirecionou-para");
  });
});

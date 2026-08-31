import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Outlet } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Perfil } from "@contracts/types";
import App from "@/App";
import RequireRevisao from "./RequireRevisao";

/**
 * Guarda de /app/revisao (v1.12.0): a fila deixou de ser do perfil `revisor`
 * da plataforma e passou a ser de quem tem papel de revisão em ALGUMA empresa
 * — aprovador/analista designado, admin da empresa ou admin da plataforma —
 * via `auth.me.podeRevisarDespesas`, calculado no servidor.
 *
 * Como no RequireAdmin.test: o teste entra pela ÁRVORE DE ROTAS de `App.tsx`,
 * porque o que quebra na vida real é a rota sair de dentro de
 * `<Route element={<RequireRevisao />}>`. `Navigate` vira sonda no markup
 * (sem DOM o redirect não roda); páginas e AppShell viram marcadores.
 */

const sessao = vi.hoisted(() => ({
  perfil: "admin" as Perfil | null,
  podeRevisarDespesas: true,
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
    user:
      sessao.perfil === null
        ? null
        : { perfil: sessao.perfil, podeRevisarDespesas: sessao.podeRevisarDespesas },
    isLoading: sessao.isLoading,
    isAuthenticated: sessao.perfil !== null,
    perfil: sessao.perfil,
    podeGerenciarEquipe: false,
    podeRevisarDespesas: sessao.podeRevisarDespesas,
    logout: async () => {},
  }),
}));

vi.mock("@/components/app/AppShell", () => ({ default: () => <Outlet /> }));
vi.mock("@/pages/app/Revisao", () => ({ default: () => <div data-pagina="revisao" /> }));
vi.mock("@/pages/app/Dashboard", () => ({ default: () => <div data-pagina="dashboard" /> }));

/**
 * `podeRevisarDespesas` é derivado no SERVIDOR; aqui é passado explicitamente
 * para separar os dois eixos — perfil global × papel de revisão em empresa.
 */
function abrir(perfil: Perfil, podeRevisarDespesas: boolean): string {
  sessao.perfil = perfil;
  sessao.podeRevisarDespesas = podeRevisarDespesas;
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={["/app/revisao"]}>
      <App />
    </MemoryRouter>
  );
}

const REDIRECT_DASHBOARD = '<i data-redirecionou-para="/app/dashboard" data-replace="sim">';

beforeEach(() => {
  sessao.perfil = "admin";
  sessao.podeRevisarDespesas = true;
  sessao.isLoading = false;
});

describe("fila de revisão por papel na empresa (v1.12.0)", () => {
  it("sem papel de revisão em empresa alguma, volta ao dashboard sem renderizar a página", () => {
    const html = abrir("cliente", false);
    expect(html).not.toContain('data-pagina="revisao"');
    expect(html).toContain(REDIRECT_DASHBOARD);
  });

  it("cliente aprovador designado (flag true) entra na fila", () => {
    const html = abrir("cliente", true);
    expect(html).toContain('data-pagina="revisao"');
    expect(html).not.toContain("data-redirecionou-para");
  });

  it("revisor da plataforma perdeu o passe global — flag false redireciona", () => {
    const html = abrir("revisor", false);
    expect(html).not.toContain('data-pagina="revisao"');
    expect(html).toContain(REDIRECT_DASHBOARD);
  });

  // Enquanto a sessão carrega, redirecionar tiraria o aprovador da própria
  // página no primeiro frame — mesmo racional do RequireEquipe.
  it("enquanto carrega, mostra o loader e não redireciona ninguém", () => {
    sessao.perfil = null;
    sessao.podeRevisarDespesas = false;
    sessao.isLoading = true;
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <RequireRevisao />
      </MemoryRouter>
    );
    expect(html).toContain("Verificando permissão");
    expect(html).not.toContain("data-redirecionou-para");
  });
});

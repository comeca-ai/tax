import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Outlet } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Perfil } from "@contracts/types";
import App from "@/App";
import RequireAdmin from "./RequireAdmin";
import RequireEquipe from "./RequireEquipe";

/**
 * Guardas de /app/regras (plataforma) e /app/equipe (empresa) — v1.8.0, revistas
 * na v1.9.1: Equipe deixou de exigir o perfil `admin` da plataforma e passou a
 * aceitar o administrador da própria empresa, via `auth.me.podeGerenciarEquipe`.
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
  podeGerenciarEquipe: true,
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
        : { perfil: sessao.perfil, podeGerenciarEquipe: sessao.podeGerenciarEquipe },
    isLoading: sessao.isLoading,
    isAuthenticated: sessao.perfil !== null,
    perfil: sessao.perfil,
    podeGerenciarEquipe: sessao.podeGerenciarEquipe,
    logout: async () => {},
  }),
}));

vi.mock("@/components/app/AppShell", () => ({ default: () => <Outlet /> }));
vi.mock("@/pages/app/Regras", () => ({ default: () => <div data-pagina="regras" /> }));
vi.mock("@/pages/app/Equipe", () => ({ default: () => <div data-pagina="equipe" /> }));
vi.mock("@/pages/app/Dashboard", () => ({ default: () => <div data-pagina="dashboard" /> }));

/**
 * `podeGerenciarEquipe` é derivado no SERVIDOR (perfil da plataforma OU dono de
 * empresa); aqui ele é passado explicitamente para separar os dois eixos —
 * perfil global × ser dono da empresa.
 */
function abrir(
  rota: string,
  perfil: Perfil,
  podeGerenciarEquipe = perfil === "admin"
): string {
  sessao.perfil = perfil;
  sessao.podeGerenciarEquipe = podeGerenciarEquipe;
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[rota]}>
      <App />
    </MemoryRouter>
  );
}

const REDIRECT_DASHBOARD = '<i data-redirecionou-para="/app/dashboard" data-replace="sim">';

beforeEach(() => {
  sessao.perfil = "admin";
  sessao.podeGerenciarEquipe = true;
  sessao.isLoading = false;
});

describe("área restrita ao time da plataforma", () => {
  it("cliente não vê Regras & Matriz e volta para o dashboard", () => {
    const html = abrir("/app/regras", "cliente");
    expect(html).not.toContain('data-pagina="regras"');
    expect(html).toContain(REDIRECT_DASHBOARD);
  });

  it("cliente sem empresa não vê Equipe e volta para o dashboard", () => {
    const html = abrir("/app/equipe", "cliente");
    expect(html).not.toContain('data-pagina="equipe"');
    expect(html).toContain(REDIRECT_DASHBOARD);
  });

  it("revisor é barrado nas duas rotas, igual ao cliente sem empresa", () => {
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

describe("Equipe aberta ao administrador da empresa (v1.9.1)", () => {
  it("cliente dono de empresa entra em /app/equipe", () => {
    const html = abrir("/app/equipe", "cliente", true);
    expect(html).toContain('data-pagina="equipe"');
    expect(html).not.toContain("data-redirecionou-para");
  });

  // O que abriu foi a equipe da empresa, não a matriz de regras da plataforma.
  it("cliente dono de empresa continua barrado em /app/regras", () => {
    const html = abrir("/app/regras", "cliente", true);
    expect(html).not.toContain('data-pagina="regras"');
    expect(html).toContain(REDIRECT_DASHBOARD);
  });

  it("revisor dono de empresa também entra em /app/equipe", () => {
    const html = abrir("/app/equipe", "revisor", true);
    expect(html).toContain('data-pagina="equipe"');
  });

  it("enquanto carrega, a guarda da Equipe segura o redirect", () => {
    sessao.perfil = null;
    sessao.podeGerenciarEquipe = false;
    sessao.isLoading = true;
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <RequireEquipe />
      </MemoryRouter>
    );
    expect(html).toContain("Verificando permissão");
    expect(html).not.toContain("data-redirecionou-para");
  });
});

import { NavLink, Outlet, Link, useLocation } from "react-router"
import {
  LayoutDashboard,
  Receipt,
  CirclePlus,
  ScrollText,
  ClipboardCheck,
  CarFront,
  Building2,
  FileChartColumn,
  Scale,
  LogOut,
  ChevronsUpDown,
  Search,
  CircleHelp,
  Bell,
  Check,
  TriangleAlert,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useAuth } from "@/hooks/useAuth"
import { useActiveCompany } from "@/hooks/useActiveCompany"
import type { RegimeTributario } from "@contracts/types"
import { cn } from "@/lib/utils"

const REGIME_ROTULO: Record<RegimeTributario, string> = {
  lucro_real: "Lucro Real",
  lucro_presumido: "Lucro Presumido",
  simples_nacional: "Simples Nacional",
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/)
  return (
    (partes[0]?.[0] ?? "") + (partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? "") : "")
  ).toUpperCase()
}

const NAV_ITEMS = [
  { to: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard, end: false },
  { to: "/app/despesas", label: "Despesas", icon: Receipt, end: true },
  { to: "/app/despesas/nova", label: "Nova Despesa", icon: CirclePlus, end: false },
  { to: "/app/politica", label: "Política", icon: ScrollText, end: false },
  { to: "/app/revisao", label: "Fila de Revisão", icon: ClipboardCheck, end: false, badge: 3 },
  { to: "/app/veiculos", label: "Veículos", icon: CarFront, end: false },
  { to: "/app/empresas", label: "Empresas", icon: Building2, end: false },
  { to: "/app/relatorios", label: "Relatórios", icon: FileChartColumn, end: false },
  { to: "/app/regras", label: "Regras & Matriz", icon: Scale, end: false },
]

const PAGE_TITLES: Record<string, string> = {
  "/app/dashboard": "Dashboard",
  "/app/despesas": "Despesas",
  "/app/despesas/nova": "Nova Despesa",
  "/app/politica": "Política",
  "/app/revisao": "Fila de Revisão",
  "/app/veiculos": "Veículos",
  "/app/empresas": "Empresas",
  "/app/relatorios": "Relatórios",
  "/app/regras": "Regras & Matriz",
}

function Sidebar() {
  const { user, logout } = useAuth()

  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-[264px] flex-col border-r border-line-dark bg-ink-900">
      <div className="flex h-16 items-center gap-2.5 border-b border-line-dark px-5">
        <img src="/logo-mark.svg" alt="reembolsa.ia" className="h-8 w-8" />
        <span className="font-display text-[15px] font-semibold tracking-[-0.01em] text-text-dark-100">
          reembolsa<span className="text-brand-400">.ia</span>
        </span>
      </div>
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                "group relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
                isActive
                  ? "bg-ink-800 text-text-dark-100"
                  : "text-text-dark-400 hover:bg-ink-800/60 hover:text-text-dark-100",
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-brand-400" />}
                <item.icon className={cn("h-[18px] w-[18px]", isActive ? "text-brand-400" : "text-text-dark-400 group-hover:text-text-dark-100")} />
                <span className="flex-1">{item.label}</span>
                {item.badge !== undefined && (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-conf-media-bg px-1.5 font-mono text-[11px] font-semibold tabular text-conf-media-text">
                    {item.badge}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-line-dark p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-900 font-display text-[13px] font-semibold text-brand-400">
            {user ? iniciais(user.nome) : "…"}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-[13px] font-medium text-text-dark-100">
              {user?.nome ?? "Carregando…"}
            </span>
            {user && (
              <span className="w-fit rounded-full border border-line-dark px-1.5 font-mono text-[10px] uppercase tracking-[0.04em] text-text-dark-400">
                {user.perfil}
              </span>
            )}
          </div>
          <button
            type="button"
            aria-label="Sair"
            onClick={() => void logout()}
            className="text-text-dark-400 transition-colors hover:text-text-dark-100"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  )
}

function Topbar() {
  const location = useLocation()
  const { user } = useAuth()
  const { activeCompany, companies, setActiveCompanyId, isLoading } = useActiveCompany()
  const pageTitle = PAGE_TITLES[location.pathname] ?? "Dashboard"

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-line bg-surface px-6">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex h-11 items-center gap-3 rounded-[10px] border border-line bg-surface px-3 text-left transition-colors hover:bg-paper"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-500/10 font-display text-[12px] font-semibold text-brand-500">
              {activeCompany ? iniciais(activeCompany.razaoSocial) : <Building2 className="h-3.5 w-3.5" />}
            </span>
            <span className="flex flex-col">
              <span className="max-w-[190px] truncate text-[13px] font-semibold text-text-900">
                {isLoading ? "Carregando…" : (activeCompany?.razaoSocial ?? "Nenhuma empresa")}
              </span>
              {activeCompany && (
                <span className="flex items-center gap-1.5">
                  <span className="font-mono text-[11px] tabular text-text-500">{activeCompany.cnpj}</span>
                  <span className="rounded-full bg-paper px-1.5 font-mono text-[10px] uppercase tracking-[0.03em] text-text-500 ring-1 ring-line">
                    {REGIME_ROTULO[activeCompany.regimeTributario as RegimeTributario] ?? activeCompany.regimeTributario}
                  </span>
                </span>
              )}
            </span>
            <ChevronsUpDown className="h-4 w-4 text-text-500" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[300px]">
          <DropdownMenuLabel className="text-[11px] uppercase tracking-[0.06em] text-text-500">
            Suas empresas
          </DropdownMenuLabel>
          {companies.map((company) => (
            <DropdownMenuItem
              key={company.id}
              onSelect={() => setActiveCompanyId(company.id)}
              className="flex items-center gap-2 py-2"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[13px] font-medium">{company.razaoSocial}</span>
                <span className="font-mono text-[11px] tabular text-text-500">
                  {company.cnpj} · {REGIME_ROTULO[company.regimeTributario as RegimeTributario] ?? company.regimeTributario}
                </span>
              </span>
              {company.id === activeCompany?.id && <Check className="h-4 w-4 text-brand-500" />}
            </DropdownMenuItem>
          ))}
          {!isLoading && companies.length === 0 && (
            <DropdownMenuItem disabled className="text-[13px] text-text-500">
              Nenhuma empresa cadastrada
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to="/app/empresas?nova=1" className="gap-2 text-brand-500">
              <CirclePlus className="h-4 w-4" /> Nova empresa
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <nav aria-label="breadcrumb" className="hidden items-center gap-1.5 text-[13px] text-text-500 md:flex">
        <span>reembolsa.ia</span>
        <span className="text-line">/</span>
        <span className="font-medium text-text-900">{pageTitle}</span>
      </nav>

      <div className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          className="hidden h-9 items-center gap-2 rounded-[10px] border border-line px-3 text-[13px] text-text-500 transition-colors hover:bg-paper sm:flex"
        >
          <Search className="h-4 w-4" />
          Buscar
          <kbd className="rounded border border-line bg-paper px-1.5 font-mono text-[10px] text-text-500">⌘K</kbd>
        </button>
        <button
          type="button"
          aria-label="Ajuda"
          className="flex h-9 w-9 items-center justify-center rounded-[10px] text-text-500 transition-colors hover:bg-paper hover:text-text-900"
        >
          <CircleHelp className="h-[18px] w-[18px]" />
        </button>
        <button
          type="button"
          aria-label="Notificações"
          className="relative flex h-9 w-9 items-center justify-center rounded-[10px] text-text-500 transition-colors hover:bg-paper hover:text-text-900"
        >
          <Bell className="h-[18px] w-[18px]" />
          <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-amber-500" />
        </button>
        <span className="ml-1 flex h-9 w-9 items-center justify-center rounded-full bg-brand-900 font-display text-[12px] font-semibold text-brand-400">
          {user ? iniciais(user.nome) : "…"}
        </span>
      </div>
    </header>
  )
}

/** App shell for all /app/* routes: dark sidebar, light topbar, RF-00 banner, disclaimer strip. */
export default function AppShell() {
  const { activeCompany, isLoading } = useActiveCompany()
  const cadastroIncompleto = !isLoading && activeCompany !== null && activeCompany.cadastroCompleto === false

  return (
    <div className="min-h-[100dvh] bg-paper">
      <Sidebar />
      <div className="pl-[264px]">
        <Topbar />
        {cadastroIncompleto && (
          <div className="flex items-center gap-3 border-b border-conf-media-dot/20 bg-conf-media-bg px-6 py-2.5">
            <TriangleAlert className="h-4 w-4 shrink-0 text-conf-media-text" />
            <p className="flex-1 text-[13px] font-medium text-conf-media-text">
              Complete o cadastro da empresa (CNAE, regime tributário, UF) para processar créditos.
            </p>
            <Link
              to="/app/empresas"
              className="inline-flex h-8 items-center rounded-lg bg-conf-media-text px-3 text-[12px] font-semibold text-white transition hover:opacity-90"
            >
              Completar cadastro
            </Link>
          </div>
        )}
        <main className="mx-auto w-full max-w-[1280px] px-6 py-6 lg:px-8">
          <Outlet />
        </main>
        <footer className="border-t border-line px-6 py-3 lg:px-8">
          <p className="mx-auto max-w-[1280px] font-mono text-[11px] tracking-[0.02em] text-text-500">
            Classificações de média confiança devem ser validadas por um advogado tributarista. reembolsa.ia não presta
            aconselhamento jurídico.
          </p>
        </footer>
      </div>
    </div>
  )
}

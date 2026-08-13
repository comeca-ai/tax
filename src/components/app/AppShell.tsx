import { useEffect, useState } from "react"
import { NavLink, Outlet, Link, useLocation } from "react-router"
import {
  LayoutDashboard,
  Receipt,
  CirclePlus,
  Zap,
  ScrollText,
  ClipboardCheck,
  CarFront,
  Building2,
  Users,
  FileChartColumn,
  Scale,
  LogOut,
  ChevronsUpDown,
  Check,
  TriangleAlert,
  Menu,
  X,
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

/** Navegação agrupada (v1.6.0): o admin pensa em 3 momentos, não em 11 telas. */
const NAV_GROUPS = [
  {
    rotulo: "Dia a dia",
    itens: [
      { to: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard, end: false },
      { to: "/app/rapido", label: "Envio Rápido", icon: Zap, end: false },
      { to: "/app/despesas", label: "Despesas", icon: Receipt, end: true },
      { to: "/app/revisao", label: "Fila de Revisão", icon: ClipboardCheck, end: false, badge: 3 },
    ],
  },
  {
    rotulo: "Configurar",
    itens: [
      { to: "/app/politica", label: "Política", icon: ScrollText, end: false },
      { to: "/app/equipe", label: "Equipe", icon: Users, end: false, adminOnly: true },
      { to: "/app/veiculos", label: "Veículos", icon: CarFront, end: false },
      { to: "/app/empresas", label: "Empresas", icon: Building2, end: false },
      { to: "/app/regras", label: "Regras & Matriz", icon: Scale, end: false },
    ],
  },
  {
    rotulo: "Fechar o mês",
    itens: [
      { to: "/app/relatorios", label: "Relatórios", icon: FileChartColumn, end: false },
    ],
  },
]

const PAGE_TITLES: Record<string, string> = {
  "/app/dashboard": "Dashboard",
  "/app/despesas": "Despesas",
  "/app/despesas/nova": "Nova Despesa",
  "/app/rapido": "Envio Rápido",
  "/app/equipe": "Equipe",
  "/app/politica": "Política",
  "/app/revisao": "Fila de Revisão",
  "/app/veiculos": "Veículos",
  "/app/empresas": "Empresas",
  "/app/relatorios": "Relatórios",
  "/app/regras": "Regras & Matriz",
}

/** Conteúdo da navegação — compartilhado entre sidebar desktop e drawer mobile. */
function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useAuth()
  const grupos = NAV_GROUPS.map((g) => ({
    ...g,
    itens: g.itens.filter((item) => !item.adminOnly || user?.perfil === "admin"),
  }))

  return (
    <>
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
        {grupos.map((grupo) => (
          <div key={grupo.rotulo} className="flex flex-col gap-1 pb-3">
            <span className="px-3 pb-1 pt-2 font-mono text-[10px] uppercase tracking-[0.08em] text-text-dark-400/70">
              {grupo.rotulo}
            </span>
            {grupo.itens.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
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
          </div>
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
    </>
  )
}

function SidebarLogo({ onClose }: { onClose?: () => void }) {
  return (
    <div className="flex h-16 items-center gap-2.5 border-b border-line-dark px-5">
      <img src="/logo-mark.svg" alt="reembolsa.ia" className="h-8 w-8" />
      <span className="font-display text-[15px] font-semibold tracking-[-0.01em] text-text-dark-100">
        reembolsa<span className="text-brand-400">.ia</span>
      </span>
      {onClose && (
        <button
          type="button"
          aria-label="Fechar menu"
          onClick={onClose}
          className="ml-auto flex h-9 w-9 items-center justify-center rounded-lg text-text-dark-400 transition-colors hover:bg-ink-800 hover:text-text-dark-100"
        >
          <X className="h-5 w-5" />
        </button>
      )}
    </div>
  )
}

/** Sidebar fixa — apenas desktop (lg+). */
function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[264px] flex-col border-r border-line-dark bg-ink-900 lg:flex">
      <SidebarLogo />
      <SidebarContent />
    </aside>
  )
}

/** Drawer de navegação — apenas mobile/tablet (< lg). */
function MobileNav({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu de navegação">
      <button
        type="button"
        aria-label="Fechar menu"
        onClick={onClose}
        className="absolute inset-0 bg-ink-950/70 backdrop-blur-[2px]"
      />
      <aside className="absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col border-r border-line-dark bg-ink-900 shadow-2xl">
        <SidebarLogo onClose={onClose} />
        <SidebarContent onNavigate={onClose} />
      </aside>
    </div>
  )
}

function Topbar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const location = useLocation()
  const { user } = useAuth()
  const { activeCompany, companies, setActiveCompanyId, isLoading } = useActiveCompany()
  const pageTitle = PAGE_TITLES[location.pathname] ?? "Dashboard"

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-2.5 border-b border-line bg-surface px-4 sm:gap-4 sm:px-6">
      <button
        type="button"
        aria-label="Abrir menu"
        onClick={onOpenMenu}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-text-700 transition-colors hover:bg-paper lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex h-11 min-w-0 items-center gap-2.5 rounded-[10px] border border-line bg-surface px-3 text-left transition-colors hover:bg-paper sm:gap-3"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand-500/10 font-display text-[12px] font-semibold text-brand-500">
              {activeCompany ? iniciais(activeCompany.razaoSocial) : <Building2 className="h-3.5 w-3.5" />}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="max-w-[120px] truncate text-[13px] font-semibold text-text-900 sm:max-w-[190px]">
                {isLoading ? "Carregando…" : (activeCompany?.razaoSocial ?? "Nenhuma empresa")}
              </span>
              {activeCompany && (
                <span className="hidden items-center gap-1.5 sm:flex">
                  <span className="font-mono text-[11px] tabular text-text-500">{activeCompany.cnpj}</span>
                  <span className="rounded-full bg-paper px-1.5 font-mono text-[10px] uppercase tracking-[0.03em] text-text-500 ring-1 ring-line">
                    {REGIME_ROTULO[activeCompany.regimeTributario as RegimeTributario] ?? activeCompany.regimeTributario}
                  </span>
                </span>
              )}
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-text-500" />
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

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
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
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()

  // Fecha o drawer ao trocar de rota
  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  // Trava o scroll do body com o drawer aberto
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : ""
    return () => {
      document.body.style.overflow = ""
    }
  }, [menuOpen])

  return (
    <div className="min-h-[100dvh] bg-paper">
      <Sidebar />
      <MobileNav open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="pl-0 lg:pl-[264px]">
        <Topbar onOpenMenu={() => setMenuOpen(true)} />
        {cadastroIncompleto && (
          <div className="flex items-center gap-3 border-b border-conf-media-dot/20 bg-conf-media-bg px-4 py-2.5 sm:px-6">
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
        <main className="mx-auto w-full max-w-[1280px] px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
          <Outlet />
        </main>
        <footer className="border-t border-line px-4 py-3 sm:px-6 lg:px-8">
          <p className="mx-auto max-w-[1280px] font-mono text-[11px] tracking-[0.02em] text-text-500">
            Classificações de média confiança devem ser validadas por um advogado tributarista. reembolsa.ia não presta
            aconselhamento jurídico.
          </p>
        </footer>
      </div>
    </div>
  )
}

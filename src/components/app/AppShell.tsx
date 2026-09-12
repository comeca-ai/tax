import { useEffect, useState } from "react"
import { Link, NavLink, Outlet } from "react-router"
import {
  Building2, Check, ChevronDown, CirclePlus, ClipboardCheck, FileChartColumn,
  LayoutDashboard, LogOut, Menu, Receipt, Scale, ScrollText, SlidersHorizontal, Users, X, Zap,
  type LucideIcon,
} from "lucide-react"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useActiveCompany } from "@/hooks/useActiveCompany"
import { useAuth } from "@/hooks/useAuth"
import type { RegimeTributario } from "@contracts/types"
import { cn } from "@/lib/utils"

const REGIME_ROTULO: Record<RegimeTributario, string> = {
  lucro_real: "Lucro Real", lucro_presumido: "Lucro Presumido", simples_nacional: "Simples Nacional",
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/)
  return ((partes[0]?.[0] ?? "") + (partes.length > 1 ? (partes.at(-1)?.[0] ?? "") : "")).toUpperCase()
}

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  adminOnly?: boolean
  equipeOnly?: boolean
  revisaoOnly?: boolean
}

const NAVEGACAO_PRINCIPAL: NavItem[] = [
  { to: "/app/dashboard", label: "Visão geral", icon: LayoutDashboard },
  { to: "/app/revisao", label: "Fila de revisão", icon: ClipboardCheck, revisaoOnly: true },
  { to: "/app/despesas", label: "Despesas", icon: Receipt },
  { to: "/app/politica", label: "Política", icon: ScrollText },
]
const NAVEGACAO_SECUNDARIA: NavItem[] = [
  { to: "/app/rapido", label: "Envio rápido", icon: Zap },
  { to: "/app/empresas", label: "Empresas", icon: Building2 },
  { to: "/app/equipe", label: "Equipe", icon: Users, equipeOnly: true },
  { to: "/app/relatorios", label: "Relatórios", icon: FileChartColumn },
  { to: "/app/regras", label: "Regras & matriz", icon: Scale, adminOnly: true },
  { to: "/app/ajustes", label: "Ajustes", icon: SlidersHorizontal, adminOnly: true },
]

function itemPermitido(item: NavItem, perfil: string | undefined, podeGerenciarEquipe: boolean, podeRevisar: boolean) {
  return (!item.adminOnly || perfil === "admin") && (!item.equipeOnly || podeGerenciarEquipe) && (!item.revisaoOnly || podeRevisar)
}

function CompanySwitcher() {
  const { activeCompany, companies, setActiveCompanyId, isLoading } = useActiveCompany()
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button type="button" className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[#F4F6F5]">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#E6F2F0] font-mono text-[11px] font-semibold text-[#0B7A75]">
          {activeCompany ? iniciais(activeCompany.razaoSocial) : <Building2 className="h-3.5 w-3.5" />}
        </span>
        <span className="hidden min-w-0 flex-col md:flex">
          <span className="max-w-[155px] truncate text-[12px] font-medium text-text-900">{isLoading ? "Carregando…" : (activeCompany?.razaoSocial ?? "Nenhuma empresa")}</span>
          {activeCompany && <span className="max-w-[155px] truncate font-mono text-[10px] text-text-500">{activeCompany.cnpj}</span>}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-text-500" />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-[310px]">
      <DropdownMenuLabel className="text-[11px] uppercase tracking-[0.06em] text-text-500">Suas empresas</DropdownMenuLabel>
      {companies.map((company) => <DropdownMenuItem key={company.id} onSelect={() => setActiveCompanyId(company.id)} className="flex items-center gap-2 py-2">
        <span className="flex min-w-0 flex-1 flex-col"><span className="truncate text-[13px] font-medium">{company.razaoSocial}</span><span className="font-mono text-[11px] text-text-500">{company.cnpj} · {REGIME_ROTULO[company.regimeTributario as RegimeTributario] ?? company.regimeTributario}</span></span>
        {company.id === activeCompany?.id && <Check className="h-4 w-4 text-[#0B7A75]" />}
      </DropdownMenuItem>)}
      {!isLoading && companies.length === 0 && <DropdownMenuItem disabled>Nenhuma empresa cadastrada</DropdownMenuItem>}
      <DropdownMenuSeparator />
      <DropdownMenuItem asChild><Link to="/app/empresas?nova=1" className="gap-2 text-[#0B7A75]"><CirclePlus className="h-4 w-4" /> Nova empresa</Link></DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
}

function LinkNavegacao({ item, mobile = false, onNavigate }: { item: NavItem; mobile?: boolean; onNavigate?: () => void }) {
  const Icon = item.icon
  return <NavLink to={item.to} end={item.to === "/app/despesas" || item.to === "/app/dashboard"} onClick={onNavigate} className={({ isActive }) => cn(
    mobile ? "flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium" : "flex h-[60px] items-center gap-1 border-b-2 px-3 text-[13px] font-medium transition-colors",
    isActive ? (mobile ? "bg-[#E6F2F0] text-[#075E5A]" : "border-[#0B7A75] text-text-900") : (mobile ? "text-text-500 hover:bg-[#F4F6F5] hover:text-text-900" : "border-transparent text-text-500 hover:text-text-900"),
  )}>{mobile && <Icon className="h-4 w-4" />}{item.label}</NavLink>
}

function MoreNavigation() {
  const { user, podeGerenciarEquipe, podeRevisarDespesas } = useAuth()
  const itens = NAVEGACAO_SECUNDARIA.filter((item) => itemPermitido(item, user?.perfil, podeGerenciarEquipe, podeRevisarDespesas))
  if (itens.length === 0) return null
  return <DropdownMenu><DropdownMenuTrigger asChild><button type="button" className="flex h-[60px] items-center gap-1 border-b-2 border-transparent px-3 text-[13px] font-medium text-text-500 transition-colors hover:text-text-900">Mais <ChevronDown className="h-3.5 w-3.5" /></button></DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="w-52">{itens.map((item) => { const Icon = item.icon; return <DropdownMenuItem key={item.to} asChild><Link to={item.to} className="gap-2"><Icon className="h-4 w-4" />{item.label}</Link></DropdownMenuItem> })}</DropdownMenuContent>
  </DropdownMenu>
}

function DesktopNavigation() {
  const { user, podeGerenciarEquipe, podeRevisarDespesas } = useAuth()
  const itens = NAVEGACAO_PRINCIPAL.filter((item) => itemPermitido(item, user?.perfil, podeGerenciarEquipe, podeRevisarDespesas))
  return <nav aria-label="Navegação principal" className="hidden h-[60px] items-stretch lg:flex">{itens.map((item) => <LinkNavegacao key={item.to} item={item} />)}<MoreNavigation /></nav>
}

function UserControl() {
  const { user, logout } = useAuth()
  return <div className="hidden items-center gap-2 border-l border-line pl-3 sm:flex">
    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#DCEFEB] text-[11px] font-semibold text-[#0B7A75]">{user ? iniciais(user.nome) : "…"}</span>
    <span className="hidden max-w-[110px] flex-col lg:flex"><span className="truncate text-[12px] font-semibold text-text-900">{user?.nome ?? "Carregando…"}</span>{user && <span className="text-[10px] text-text-500">{user.perfil}</span>}</span>
    <button type="button" aria-label="Sair" onClick={() => void logout()} className="rounded-md p-1.5 text-text-500 transition-colors hover:bg-[#F4F6F5] hover:text-text-900"><LogOut className="h-4 w-4" /></button>
  </div>
}

function MobileNavigation({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, podeGerenciarEquipe, podeRevisarDespesas, logout } = useAuth()
  const itens = [...NAVEGACAO_PRINCIPAL, ...NAVEGACAO_SECUNDARIA].filter((item) => itemPermitido(item, user?.perfil, podeGerenciarEquipe, podeRevisarDespesas))
  if (!open) return null
  return <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu de navegação">
    <button type="button" aria-label="Fechar menu" onClick={onClose} className="absolute inset-0 bg-[#14211F]/25 backdrop-blur-[1px]" />
    <aside className="absolute inset-y-0 left-0 flex w-[300px] max-w-[88vw] flex-col bg-surface shadow-2xl">
      <div className="flex h-16 items-center justify-between border-b border-line px-5"><Link to="/app/dashboard" onClick={onClose} className="flex items-center gap-2 font-display text-[16px] font-semibold text-text-900 no-underline"><span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#0B7A75] font-mono text-[12px] text-white">R</span>reembolsa<span className="text-[#0B7A75]">.ai</span></Link><button type="button" aria-label="Fechar menu" onClick={onClose} className="rounded-md p-2 text-text-500 hover:bg-paper"><X className="h-5 w-5" /></button></div>
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">{itens.map((item) => <LinkNavegacao key={item.to} item={item} mobile onNavigate={onClose} />)}</nav>
      <div className="border-t border-line p-4"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#DCEFEB] text-[12px] font-semibold text-[#0B7A75]">{user ? iniciais(user.nome) : "…"}</span><span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-semibold">{user?.nome}</span><span className="text-[11px] text-text-500">{user?.perfil}</span></span><button type="button" aria-label="Sair" onClick={() => void logout()} className="rounded-md p-2 text-text-500 hover:bg-paper"><LogOut className="h-4 w-4" /></button></div></div>
    </aside>
  </div>
}

/** Casca v2: navegação horizontal clara, conectada às rotas e permissões reais. */
export default function AppShell() {
  const { activeCompany, isLoading } = useActiveCompany()
  const cadastroIncompleto = !isLoading && activeCompany !== null && activeCompany.cadastroCompleto === false
  const [menuOpen, setMenuOpen] = useState(false)
  useEffect(() => { document.body.style.overflow = menuOpen ? "hidden" : ""; return () => { document.body.style.overflow = "" } }, [menuOpen])
  return <div className="painel-v2 min-h-[100dvh] bg-[#F4F6F5] text-[#14211F]">
    <header className="sticky top-0 z-30 border-b border-[#E1E6E3] bg-surface/95 backdrop-blur"><div className="mx-auto flex h-[60px] max-w-[1320px] items-center gap-3 px-4 sm:px-6 lg:px-8">
      <Link to="/app/dashboard" className="flex shrink-0 items-center gap-2.5 font-display text-[16px] font-semibold tracking-[-0.01em] text-[#14211F] no-underline"><span className="flex h-[26px] w-[26px] items-center justify-center rounded-[7px] bg-[#0B7A75] font-mono text-[12px] font-semibold text-white">R</span><span className="hidden sm:inline">reembolsa<span className="text-[#0B7A75]">.ai</span></span></Link>
      <DesktopNavigation /><div className="ml-auto flex min-w-0 items-center gap-1.5"><CompanySwitcher /><UserControl /></div><button type="button" aria-label="Abrir menu" onClick={() => setMenuOpen(true)} className="rounded-md p-2 text-text-500 hover:bg-paper lg:hidden"><Menu className="h-5 w-5" /></button>
    </div></header>
    <MobileNavigation open={menuOpen} onClose={() => setMenuOpen(false)} />
    {cadastroIncompleto && <div className="border-b border-[#EBD2A2] bg-[#FBF3E4] px-4 py-2.5 sm:px-6 lg:px-8"><div className="mx-auto flex max-w-[1320px] items-center gap-3 text-[13px] text-[#8A5A0E]"><span className="flex-1">Complete os dados fiscais da empresa para processar os reembolsos com segurança.</span><Link to="/app/empresas" className="font-semibold text-[#8A5A0E]">Completar cadastro</Link></div></div>}
    <main className="mx-auto w-full max-w-[1320px] px-4 py-7 sm:px-6 sm:py-8 lg:px-8"><Outlet /></main>
    <footer className="border-t border-[#E1E6E3] px-4 py-3 sm:px-6 lg:px-8"><p className="mx-auto max-w-[1320px] font-mono text-[11px] tracking-[0.02em] text-text-500">Classificações de média confiança devem ser validadas por um responsável. reembolsa.ia não presta aconselhamento jurídico.</p></footer>
  </div>
}

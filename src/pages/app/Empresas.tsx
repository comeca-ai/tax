import { useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router"
import { motion } from "framer-motion"
import {
  Archive,
  Building2,
  Check,
  CheckCircle2,
  CirclePlus,
  Database,
  EllipsisVertical,
  Info,
  Mail,
  ScanLine,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react"
import { toast } from "sonner"
import { trpc } from "@/providers/trpc"
import { useAuth } from "@/hooks/useAuth"
import { useActiveCompany } from "@/hooks/useActiveCompany"
import type { Perfil, RegimeTributario } from "@contracts/types"
import EmpresaForm from "@/components/ops/EmpresaForm"
import type { EmpresaFormValores } from "@/components/ops/EmpresaForm"
import { REGIME_ROTULO } from "@/components/ops/rotulos"
import { Skeleton } from "@/components/ui/skeleton"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

type EmpresaLista = NonNullable<ReturnType<typeof trpc.empresas.list.useQuery>["data"]> extends readonly (infer T)[] ? T : any

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/)
  return (
    (partes[0]?.[0] ?? "") + (partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? "") : "")
  ).toUpperCase()
}

const PERFIL_DESCRICAO: { perfil: Perfil; texto: string }[] = [
  { perfil: "admin", texto: "Acesso total: empresas, despesas, revisão, relatórios e regras." },
  { perfil: "cliente", texto: "Opera despesas e empresas; a fila de revisão fica com o compliance." },
  { perfil: "revisor", texto: "Acesso à fila de revisão e relatórios (decisões de média confiança)." },
]

type Aba = "dados" | "equipe" | "plataforma"

export default function Empresas() {
  const { user } = useAuth()
  const { activeCompany, companies, setActiveCompanyId, isLoading } = useActiveCompany()
  const utils = trpc.useUtils()
  const [searchParams, setSearchParams] = useSearchParams()

  const [aba, setAba] = useState<Aba>("dados")
  const [modalNova, setModalNova] = useState(false)
  const [formDirty, setFormDirty] = useState(false)
  const [trocaPendente, setTrocaPendente] = useState<{ tipo: "empresa"; id: number } | { tipo: "aba"; aba: Aba } | null>(null)

  // ?nova=1 → abre direto o formulário de nova empresa
  useEffect(() => {
    if (searchParams.get("nova") === "1") {
      setModalNova(true)
      searchParams.delete("nova")
      setSearchParams(searchParams, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const detalhe = trpc.empresas.get.useQuery(
    { id: activeCompany?.id ?? 0 },
    { enabled: !!activeCompany, retry: false },
  )
  const matriz = trpc.regras.matriz.useQuery(undefined, { staleTime: 300_000 })

  const criar = trpc.empresas.create.useMutation({
    onSuccess: async (r) => {
      await utils.empresas.list.invalidate()
      setActiveCompanyId(r.id)
      setModalNova(false)
      toast.success("Empresa cadastrada — créditos liberados.")
    },
  })

  const atualizar = trpc.empresas.update.useMutation({
    onSuccess: async (_r, vars) => {
      await Promise.all([
        utils.empresas.list.invalidate(),
        utils.empresas.get.invalidate({ id: vars.id }),
      ])
      toast.success("Dados fiscais salvos")
    },
  })

  const onDirtyChange = useCallback((dirty: boolean) => setFormDirty(dirty), [])

  const submitEdicao = async (valores: EmpresaFormValores) => {
    if (!activeCompany) return
    await atualizar.mutateAsync({ id: activeCompany.id, dados: valores })
  }

  const submitCriacao = async (valores: EmpresaFormValores) => {
    await criar.mutateAsync(valores)
  }

  const trocarEmpresa = (id: number) => {
    if (id === activeCompany?.id) return
    if (formDirty) {
      setTrocaPendente({ tipo: "empresa", id })
    } else {
      setActiveCompanyId(id)
      const alvo = companies.find((c) => c.id === id)
      if (alvo) toast.success(`Agora você está vendo ${alvo.razaoSocial}`)
    }
  }

  const trocarAba = (nova: Aba) => {
    if (nova === aba) return
    if (formDirty && aba === "dados") {
      setTrocaPendente({ tipo: "aba", aba: nova })
    } else {
      setAba(nova)
    }
  }

  const confirmarTroca = () => {
    if (!trocaPendente) return
    if (trocaPendente.tipo === "empresa") {
      setFormDirty(false)
      setActiveCompanyId(trocaPendente.id)
      const alvo = companies.find((c) => c.id === trocaPendente.id)
      if (alvo) toast.success(`Agora você está vendo ${alvo.razaoSocial}`)
    } else {
      setFormDirty(false)
      setAba(trocaPendente.aba)
    }
    setTrocaPendente(null)
  }

  // Checklist RF-00
  const checklist = useMemo(() => {
    const d = detalhe.data
    if (!d) return []
    return [
      { rotulo: "CNAE principal", ok: Boolean(d.cnaePrincipal), opcional: false },
      { rotulo: "Regime tributário", ok: Boolean(d.regimeTributario), opcional: false },
      { rotulo: "UF", ok: Boolean(d.uf), opcional: false },
      { rotulo: "CNAEs secundários", ok: d.cnaesSecundarios.length > 0, opcional: true },
    ]
  }, [detalhe.data])

  const obrigatoriosOk = checklist.filter((c) => !c.opcional && c.ok).length
  const completo = detalhe.data?.cadastroCompleto ?? false

  const valoresEdicao: Partial<EmpresaFormValores> | undefined = useMemo(() => {
    const d = detalhe.data
    if (!d) return undefined
    return {
      razaoSocial: d.razaoSocial,
      cnpj: d.cnpj,
      cnaePrincipal: d.cnaePrincipal,
      cnaesSecundarios: d.cnaesSecundarios,
      regimeTributario: d.regimeTributario as EmpresaFormValores["regimeTributario"],
      uf: d.uf as EmpresaFormValores["uf"],
    }
  }, [detalhe.data])

  const matrizPreview = useMemo(
    () => matriz.data?.map((r) => ({ cnaePadrao: r.cnaePadrao, categoria: r.categoria, confianca: r.confianca })),
    [matriz.data],
  )

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-10 w-96" />
        <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <Skeleton className="h-[480px]" />
          <Skeleton className="h-[480px]" />
        </div>
      </div>
    )
  }

  return (
    <motion.div
      key={activeCompany?.id ?? "sem-empresa"}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="flex flex-col gap-6"
    >
      {/* Header */}
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-semibold tracking-[-0.01em] text-text-900">
          Empresas
        </h1>
        <button
          type="button"
          onClick={() => setModalNova(true)}
          className="ml-auto inline-flex h-11 items-center gap-2 rounded-[10px] bg-brand-500 px-4 text-sm font-semibold text-white transition hover:-translate-y-px hover:bg-brand-500/90"
        >
          <CirclePlus className="h-4 w-4" /> Nova empresa
        </button>
      </header>

      <Tabs value={aba} onValueChange={(v) => trocarAba(v as Aba)}>
        <TabsList className="h-11 rounded-[10px] border border-line bg-surface p-1">
          <TabsTrigger value="dados" className="rounded-lg px-4 text-[13px]">
            Dados fiscais
          </TabsTrigger>
          <TabsTrigger value="equipe" className="rounded-lg px-4 text-[13px]">
            Equipe
          </TabsTrigger>
          <TabsTrigger value="plataforma" className="rounded-lg px-4 text-[13px]">
            Plataforma
          </TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Dados fiscais (RF-00) ─────────────────────────────── */}
        <TabsContent value="dados" className="mt-5">
          {!activeCompany ? (
            <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-line bg-surface px-8 py-16 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full border border-dashed border-line">
                <Building2 className="h-7 w-7 text-text-500/60" />
              </span>
              <div className="flex flex-col gap-1">
                <h3 className="font-display text-lg font-medium tracking-[-0.01em] text-text-900">
                  Nenhuma empresa cadastrada
                </h3>
                <p className="max-w-sm text-sm text-text-500">
                  O cadastro fiscal (CNAE, regime tributário e UF) é o que libera o motor de
                  créditos (RF-00).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalNova(true)}
                className="mt-1 inline-flex h-10 items-center gap-2 rounded-[10px] bg-brand-500 px-4 text-sm font-semibold text-white transition hover:bg-brand-500/90"
              >
                <CirclePlus className="h-4 w-4" /> Cadastrar empresa
              </button>
            </div>
          ) : (
            <div className="grid items-start gap-4 lg:grid-cols-[1.5fr_1fr]">
              {/* Formulário */}
              <div className="rounded-xl border border-line bg-surface p-6 shadow-card">
                <div className="mb-5 flex items-center justify-between gap-3">
                  <h2 className="font-display text-lg font-medium tracking-[-0.01em] text-text-900">
                    Dados fiscais — {activeCompany.razaoSocial}
                  </h2>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.04em]",
                      completo ? "bg-conf-alta-bg text-conf-alta-text" : "bg-conf-media-bg text-conf-media-text",
                    )}
                  >
                    {completo ? "Cadastro completo" : "Cadastro incompleto"}
                  </span>
                </div>
                {detalhe.isLoading || !valoresEdicao ? (
                  <div className="flex flex-col gap-4">
                    <Skeleton className="h-11" />
                    <Skeleton className="h-11" />
                    <Skeleton className="h-11" />
                    <Skeleton className="h-24" />
                  </div>
                ) : (
                  <EmpresaForm
                    modo="editar"
                    valoresIniciais={valoresEdicao}
                    onSubmit={submitEdicao}
                    onDirtyChange={onDirtyChange}
                    matriz={matrizPreview}
                  />
                )}
              </div>

              {/* Sidebar de status */}
              <div className="flex flex-col gap-4">
                {/* Checklist de completude */}
                <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
                  <div
                    className={cn(
                      "flex items-center gap-2.5 px-5 py-3.5",
                      completo ? "bg-conf-alta-bg/60" : "bg-conf-media-bg/60",
                    )}
                  >
                    {completo ? (
                      <CheckCircle2 className="h-5 w-5 text-conf-alta-text" />
                    ) : (
                      <TriangleAlert className="h-5 w-5 text-conf-media-text" />
                    )}
                    <span
                      className={cn(
                        "text-[13px] font-semibold",
                        completo ? "text-conf-alta-text" : "text-conf-media-text",
                      )}
                    >
                      {completo
                        ? "Cadastro completo — créditos liberados"
                        : "Cadastro incompleto"}
                    </span>
                  </div>
                  <div className="flex flex-col gap-3 px-5 py-4">
                    <ul className="flex flex-col gap-2.5">
                      {checklist.map((item, i) => (
                        <motion.li
                          key={item.rotulo}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.06, duration: 0.25 }}
                          className="flex items-center gap-2.5"
                        >
                          <span
                            className={cn(
                              "flex h-5 w-5 items-center justify-center rounded-full",
                              item.ok ? "bg-conf-alta-dot text-white" : "bg-paper ring-1 ring-line",
                            )}
                          >
                            {item.ok && <Check className="h-3 w-3" />}
                          </span>
                          <span className="text-[13px] text-text-900">
                            {item.rotulo}
                            {item.opcional && (
                              <span className="ml-1.5 text-[11px] text-text-500">(opcional)</span>
                            )}
                          </span>
                        </motion.li>
                      ))}
                    </ul>
                    {!completo && (
                      <>
                        <Progress value={(obrigatoriosOk / 3) * 100} className="h-1.5" />
                        <p className="text-[12px] leading-snug text-text-500">
                          O processamento de créditos fica bloqueado até completar os itens
                          acima (RF-00).
                        </p>
                      </>
                    )}
                  </div>
                </div>

                {/* Empresas nesta conta */}
                <div className="rounded-xl border border-line bg-surface shadow-card">
                  <div className="border-b border-line px-5 py-3.5">
                    <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-text-500">
                      Empresas nesta conta
                    </span>
                  </div>
                  <ul className="flex flex-col p-2">
                    {companies.map((empresa) => (
                      <LinhaEmpresa
                        key={empresa.id}
                        empresa={empresa}
                        ativa={empresa.id === activeCompany.id}
                        onSelecionar={() => trocarEmpresa(empresa.id)}
                      />
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── Tab 2: Equipe ────────────────────────────────────────────── */}
        <TabsContent value="equipe" className="mt-5">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-text-500">Usuários com acesso a esta empresa</p>
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="ml-auto inline-flex items-center gap-2">
                      <button
                        type="button"
                        disabled
                        className="inline-flex h-10 cursor-not-allowed items-center gap-2 rounded-[10px] bg-brand-500 px-4 text-sm font-semibold text-white opacity-50"
                      >
                        <Mail className="h-4 w-4" /> Convidar usuário
                      </button>
                      <span className="rounded-full bg-conf-media-bg px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.04em] text-conf-media-text">
                        em breve
                      </span>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">Convites de equipe estarão disponíveis em breve.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-line">
                    <th className="h-11 px-4 text-[12px] font-medium uppercase tracking-[0.04em] text-text-500">Nome</th>
                    <th className="h-11 px-4 text-[12px] font-medium uppercase tracking-[0.04em] text-text-500">E-mail</th>
                    <th className="h-11 px-4 text-[12px] font-medium uppercase tracking-[0.04em] text-text-500">Perfil</th>
                    <th className="h-11 px-4 text-[12px] font-medium uppercase tracking-[0.04em] text-text-500">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {user && (
                    <motion.tr
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25 }}
                      className="h-14 border-b border-line last:border-b-0"
                    >
                      <td className="px-4">
                        <span className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-900 font-display text-[11px] font-semibold text-brand-400">
                            {iniciais(user.nome)}
                          </span>
                          <span className="text-sm font-medium text-text-900">
                            {user.nome} <span className="text-text-500">(você)</span>
                          </span>
                        </span>
                      </td>
                      <td className="px-4 font-mono text-[13px] tabular text-text-900">{user.email}</td>
                      <td className="px-4">
                        <span className="rounded-full bg-paper px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.04em] text-text-500 ring-1 ring-line">
                          {user.perfil}
                        </span>
                      </td>
                      <td className="px-4">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-conf-alta-bg px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.04em] text-conf-alta-text">
                          <span className="h-1.5 w-1.5 rounded-full bg-conf-alta-dot" /> Ativo
                        </span>
                      </td>
                    </motion.tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex items-start gap-3 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
              <div className="flex flex-col gap-1">
                <span className="text-[13px] font-semibold text-text-900">O que cada perfil pode fazer</span>
                <ul className="flex flex-col gap-0.5">
                  {PERFIL_DESCRICAO.map((p) => (
                    <li key={p.perfil} className="text-[12.5px] leading-snug text-text-500">
                      <span className="font-mono text-[11px] uppercase tracking-[0.03em] text-text-900">{p.perfil}</span>
                      {" — "}
                      {p.texto}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ── Tab 3: Plataforma ────────────────────────────────────────── */}
        <TabsContent value="plataforma" className="mt-5">
          <div className="grid items-start gap-4 lg:grid-cols-2">
            {/* OCR */}
            <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5 shadow-card">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-brand-500/10 text-brand-500">
                  <ScanLine className="h-4 w-4" />
                </span>
                <h3 className="text-[15px] font-semibold text-text-900">Leitor de notas (OCR)</h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-conf-alta-dot" />
                <span className="text-[13px] font-medium text-text-900">Provedor de OCR: Ativo</span>
              </div>
              <p className="text-[12.5px] leading-relaxed text-text-500">
                Extração automática de CNPJ, CFOP, NCM, CST, valores, data e litros. Se a
                leitura falhar, o preenchimento assistido assume.
              </p>
            </div>

            {/* Dados */}
            <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5 shadow-card">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-brand-500/10 text-brand-500">
                  <Database className="h-4 w-4" />
                </span>
                <h3 className="text-[15px] font-semibold text-text-900">Dados</h3>
              </div>
              <p className="text-[12.5px] leading-relaxed text-text-500">
                Banco de dados provisionado automaticamente pela plataforma — nada para
                instalar. Seus dados ficam na plataforma, com trilha de auditoria imutável.
              </p>
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="w-fit">
                      <button
                        type="button"
                        disabled
                        className="inline-flex h-9 cursor-not-allowed items-center rounded-[10px] border border-line px-3 text-[13px] font-medium text-text-500 opacity-50"
                      >
                        Exportar todos os dados (CSV/PDF)
                      </button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">Exportação completa disponível em breve — use os relatórios.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            {/* Sessão & segurança */}
            <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5 shadow-card">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-brand-500/10 text-brand-500">
                  <ShieldCheck className="h-4 w-4" />
                </span>
                <h3 className="text-[15px] font-semibold text-text-900">Sessão & segurança</h3>
              </div>
              <p className="text-[12.5px] leading-relaxed text-text-500">
                Autenticação própria com e-mail e senha; sessão em cookie seguro.
              </p>
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="w-fit">
                      <button
                        type="button"
                        disabled
                        className="inline-flex h-9 cursor-not-allowed items-center rounded-[10px] border border-line px-3 text-[13px] font-medium text-text-500 opacity-50"
                      >
                        Encerrar outras sessões
                      </button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">Gerenciamento de sessões disponível em breve.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            {/* Zona de perigo */}
            <div className="flex flex-col gap-3 rounded-xl border border-red-500/40 bg-surface p-5 shadow-card">
              <h3 className="text-[15px] font-semibold text-red-500">Zona de perigo</h3>
              <p className="text-[12.5px] leading-relaxed text-text-500">
                Excluir a conta remove empresas, despesas e trilhas de auditoria de forma
                irreversível.
              </p>
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="w-fit">
                      <button
                        type="button"
                        disabled
                        className="inline-flex h-9 cursor-not-allowed items-center rounded-[10px] border border-red-500/50 px-3 text-[13px] font-semibold text-red-500 opacity-50"
                      >
                        Excluir conta
                      </button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">Exclusão de conta disponível em breve.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Modal Nova empresa */}
      <Dialog open={modalNova} onOpenChange={setModalNova}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Nova empresa</DialogTitle>
            <DialogDescription>
              Cadastre outro tenant. CNAE principal, regime tributário e UF são obrigatórios
              para processar créditos (RF-00).
            </DialogDescription>
          </DialogHeader>
          <EmpresaForm modo="criar" onSubmit={submitCriacao} submitLabel="Cadastrar empresa" />
        </DialogContent>
      </Dialog>

      {/* Guard de alterações não salvas */}
      <Dialog open={trocaPendente !== null} onOpenChange={(open) => !open && setTrocaPendente(null)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Descartar alterações?</DialogTitle>
            <DialogDescription>
              Há alterações não salvas nos dados fiscais. Ao continuar, elas serão descartadas.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setTrocaPendente(null)}
              className="inline-flex h-10 items-center rounded-[10px] border border-line px-4 text-sm font-medium text-text-900 transition hover:bg-paper"
            >
              Continuar editando
            </button>
            <button
              type="button"
              onClick={confirmarTroca}
              className="inline-flex h-10 items-center rounded-[10px] bg-red-500 px-4 text-sm font-semibold text-white transition hover:bg-red-500/90"
            >
              Descartar e continuar
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}

function LinhaEmpresa({
  empresa,
  ativa,
  onSelecionar,
}: {
  empresa: EmpresaLista
  ativa: boolean
  onSelecionar: () => void
}) {
  return (
    <li>
      <div
        className={cn(
          "flex items-center gap-2.5 rounded-[10px] border px-3 py-2.5 transition-colors",
          ativa ? "border-brand-500/60 bg-brand-500/5" : "border-transparent hover:bg-paper",
        )}
      >
        <button
          type="button"
          onClick={onSelecionar}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand-500/10 font-display text-[11px] font-semibold text-brand-500">
            {iniciais(empresa.razaoSocial)}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[13px] font-medium text-text-900">
              {empresa.razaoSocial}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="font-mono text-[11px] tabular text-text-500">{empresa.cnpj}</span>
              <span className="rounded-full bg-paper px-1.5 font-mono text-[9.5px] uppercase tracking-[0.03em] text-text-500 ring-1 ring-line">
                {REGIME_ROTULO[empresa.regimeTributario as RegimeTributario] ?? empresa.regimeTributario}
              </span>
            </span>
          </span>
          <span
            className={cn(
              "h-2 w-2 shrink-0 rounded-full",
              empresa.cadastroCompleto ? "bg-conf-alta-dot" : "bg-conf-media-dot",
            )}
            title={empresa.cadastroCompleto ? "Cadastro completo" : "Cadastro incompleto"}
          />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Ações de ${empresa.razaoSocial}`}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-500 transition hover:bg-paper hover:text-text-900"
            >
              <EllipsisVertical className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled className="gap-2 text-red-500/60">
              <Archive className="h-3.5 w-3.5" /> Arquivar empresa (em breve)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  )
}

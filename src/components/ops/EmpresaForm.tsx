import { useEffect, useMemo, useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { motion } from "framer-motion"
import { Check, Loader2, Lock, Search, TriangleAlert } from "lucide-react"
import { Link } from "react-router"
import { toast } from "sonner"
import { REGIMES_TRIBUTARIOS, UFS_BRASIL } from "@contracts/types"
import type { CnaeReceita, NivelConfianca, RegimeTributario, Uf } from "@contracts/types"
import { cnaePorCodigo } from "@/lib/cnaes"
import type { Cnae } from "@/lib/cnaes"
import { cnpjValido, mascaraCnpj } from "@/lib/cnpj"
import { useConsultaCnpj } from "@/lib/useConsultaCnpj"
import { useAuth } from "@/hooks/useAuth"
import { cn } from "@/lib/utils"
import CnaeCombobox from "@/components/ops/CnaeCombobox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

// ─────────────────────────────────────────────────────────────────────────────
// Schema / tipos
// ─────────────────────────────────────────────────────────────────────────────

export const empresaFormSchema = z.object({
  razaoSocial: z.string().min(2, "Informe a razão social"),
  cnpj: z.string().refine(cnpjValido, "CNPJ inválido (confira os dígitos)"),
  cnaePrincipal: z.string().min(1, "Selecione o CNAE principal"),
  cnaesSecundarios: z.array(z.string()).max(20),
  regimeTributario: z.enum(REGIMES_TRIBUTARIOS, { message: "Selecione o regime tributário" }),
  uf: z.enum(UFS_BRASIL, { message: "Selecione a UF" }),
})

export type EmpresaFormValores = z.infer<typeof empresaFormSchema>

const REGIMES: { valor: RegimeTributario; rotulo: string; dica: string }[] = [
  { valor: "simples_nacional", rotulo: "Simples Nacional", dica: "Tributação unificada; créditos limitados pelo regime." },
  { valor: "lucro_presumido", rotulo: "Lucro Presumido", dica: "PIS/COFINS cumulativo; dedutibilidade das despesas." },
  { valor: "lucro_real", rotulo: "Lucro Real", dica: "Créditos de PIS/COFINS no regime não-cumulativo." },
]

const CONFIANCA_ORDEM: NivelConfianca[] = ["vedado", "baixa", "media", "alta"]
const CONFIANCA_ROTULO: Record<NivelConfianca, string> = {
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
  vedado: "Vedado",
}
const CATEGORIA_TEXTO: Record<string, string> = {
  combustivel: "combustível",
  alimentacao: "alimentação",
  hospedagem: "hospedagem",
  pedagio: "pedágio",
  uber: "uber",
  taxi: "táxi",
}

/** CNAE "49.30-2" casa com padrões "49.30-2", "49.3x", "49.xx", "*". */
function cnaeCasa(padrao: string, cnae: string): boolean {
  if (padrao === "*") return true
  if (padrao === cnae) return true
  const prefixo = padrao.replace(/x/gi, "").replace(/[.\-/]+$/, "")
  if (!prefixo || !/[\dx]/.test(padrao.slice(-1))) return false
  return cnae.replace(/\D/g, "").startsWith(prefixo.replace(/\D/g, ""))
}

const inputCls = cn(
  "h-11 w-full rounded-[10px] border border-line bg-surface px-3.5 text-sm text-text-900 outline-none transition-[border,box-shadow] duration-150 placeholder:text-text-500/60",
  "focus:border-brand-500 focus:shadow-[0_0_0_3px_rgba(14,169,104,0.18)]",
)

function Campo({ label, erro, children, helper }: { label: string; erro?: string; children: React.ReactNode; helper?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium uppercase tracking-[0.04em] text-text-500">{label}</span>
      {children}
      {erro ? (
        <span className="text-[12px] font-medium text-red-500">{erro}</span>
      ) : helper ? (
        <span className="text-[12px] text-text-500">{helper}</span>
      ) : null}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Formulário de empresa (RF-00) — usado na aba Dados fiscais e no modal "Nova empresa"
// ─────────────────────────────────────────────────────────────────────────────

interface EmpresaFormProps {
  modo: "criar" | "editar"
  valoresIniciais?: Partial<EmpresaFormValores>
  onSubmit: (valores: EmpresaFormValores) => Promise<void> | void
  onDirtyChange?: (dirty: boolean) => void
  submitLabel?: string
  /** Linha da matriz CNAE × categoria (confiança por tributo) para o preview. */
  matriz?: { cnaePadrao: string; categoria: string; confianca: string }[]
}

export default function EmpresaForm({
  modo,
  valoresIniciais,
  onSubmit,
  onDirtyChange,
  submitLabel,
  matriz,
}: EmpresaFormProps) {
  const [pendenteRegime, setPendenteRegime] = useState<RegimeTributario | null>(null)
  // A matriz é área restrita (v1.8.0): só quem pode abrir vê o atalho.
  const { perfil } = useAuth()

  // ── Consulta de CNPJ na Receita (v1.3.0) ───────────────────────────────
  const { consultar, carregando: consultandoReceita, erro: erroReceita } = useConsultaCnpj()
  const [situacaoReceita, setSituacaoReceita] = useState<string | null>(null)
  /** CNAEs retornados pela Receita que não constam na lista curada (código + descrição da API). */
  const [cnaesExtras, setCnaesExtras] = useState<Cnae[]>([])

  const form = useForm<EmpresaFormValores>({
    resolver: zodResolver(empresaFormSchema),
    defaultValues: {
      razaoSocial: "",
      cnpj: "",
      cnaePrincipal: "",
      cnaesSecundarios: [],
      regimeTributario: undefined as unknown as RegimeTributario,
      uf: undefined as unknown as Uf,
      ...valoresIniciais,
    },
  })
  const { control, register, handleSubmit, formState, watch, setValue, reset } = form

  // Recarrega valores quando a empresa ativa troca (modo edição)
  const chave = JSON.stringify(valoresIniciais ?? {})
  useEffect(() => {
    reset({
      razaoSocial: "",
      cnpj: "",
      cnaePrincipal: "",
      cnaesSecundarios: [],
      regimeTributario: undefined as unknown as RegimeTributario,
      uf: undefined as unknown as Uf,
      ...valoresIniciais,
    })
    setSituacaoReceita(null)
    setCnaesExtras([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave])

  useEffect(() => {
    onDirtyChange?.(formState.isDirty)
  }, [formState.isDirty, onDirtyChange])

  const cnaePrincipal = watch("cnaePrincipal")
  const regimeAtual = watch("regimeTributario")
  const cnpjAtual = watch("cnpj")

  /** v1.3.0: busca o CNPJ na Receita e preenche o formulário (tudo continua editável). */
  const buscarReceita = async () => {
    const cnpj = cnpjAtual ?? ""
    if (!cnpjValido(cnpj)) return
    const dados = await consultar(cnpj)
    if (!dados) return

    // CNAEs que não estão na lista curada: guarda código+descrição da API para exibição
    const recebidos = [dados.cnaePrincipal, ...dados.cnaesSecundarios].filter(
      (c): c is CnaeReceita => c !== null,
    )
    const novos = recebidos.filter((c) => !cnaePorCodigo(c.codigo))
    if (novos.length > 0) {
      setCnaesExtras((prev) => [
        ...prev.filter((p) => !novos.some((n) => n.codigo === p.codigo)),
        ...novos,
      ])
    }

    setValue("razaoSocial", dados.razaoSocial, { shouldDirty: true })
    if (dados.cnaePrincipal) {
      setValue("cnaePrincipal", dados.cnaePrincipal.codigo, { shouldDirty: true })
    }
    setValue("cnaesSecundarios", dados.cnaesSecundarios.map((c) => c.codigo), { shouldDirty: true })
    if (dados.uf && (UFS_BRASIL as readonly string[]).includes(dados.uf)) {
      setValue("uf", dados.uf as Uf, { shouldDirty: true })
    }
    setSituacaoReceita(dados.situacao && dados.situacao !== "ATIVA" ? dados.situacao : null)
    toast.success("Dados da Receita Federal preenchidos — confira e ajuste se precisar.")
  }

  const linhaMatriz = useMemo(() => {
    if (!cnaePrincipal || !matriz) return null
    const porCategoria = new Map<string, NivelConfianca>()
    for (const regra of matriz) {
      if (!cnaeCasa(regra.cnaePadrao, cnaePrincipal)) continue
      const atual = porCategoria.get(regra.categoria)
      const nivel = regra.confianca as NivelConfianca
      if (!atual || CONFIANCA_ORDEM.indexOf(nivel) > CONFIANCA_ORDEM.indexOf(atual)) {
        porCategoria.set(regra.categoria, nivel)
      }
    }
    if (porCategoria.size === 0) return null
    return [...porCategoria.entries()]
      .slice(0, 3)
      .map(([cat, nivel]) => `${CATEGORIA_TEXTO[cat] ?? cat} ${CONFIANCA_ROTULO[nivel]}`)
      .join(" · ")
  }, [cnaePrincipal, matriz])

  const cnaeInfo = cnaePrincipal
    ? cnaePorCodigo(cnaePrincipal) ?? cnaesExtras.find((c) => c.codigo === cnaePrincipal)
    : undefined

  const escolherRegime = (valor: RegimeTributario) => {
    if (valor === regimeAtual) return
    if (modo === "editar" && regimeAtual) {
      setPendenteRegime(valor)
    } else {
      setValue("regimeTributario", valor, { shouldDirty: true })
    }
  }

  const [salvando, setSalvando] = useState(false)
  const submit = handleSubmit(async (valores) => {
    setSalvando(true)
    try {
      await onSubmit(valores)
      if (modo === "editar") reset(valores)
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível salvar.")
    } finally {
      setSalvando(false)
    }
  })

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Campo label="Razão social" erro={formState.errors.razaoSocial?.message}>
          <input {...register("razaoSocial")} placeholder="Transportes Horizonte Ltda." className={inputCls} />
        </Campo>
        <Campo
          label="CNPJ"
          erro={formState.errors.cnpj?.message}
          helper={modo === "editar" ? "Com créditos apurados vinculados, o CNPJ fica bloqueado para edição." : undefined}
        >
          <Controller
            control={control}
            name="cnpj"
            render={({ field }) => (
              <div className="flex items-start gap-2">
                <div className="relative flex-1">
                  <input
                    value={field.value}
                    onChange={(e) => field.onChange(mascaraCnpj(e.target.value))}
                    placeholder="00.000.000/0000-00"
                    inputMode="numeric"
                    className={cn(inputCls, "font-mono tabular")}
                  />
                  {modo === "editar" && (
                    <Lock className="pointer-events-none absolute right-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-500/60" />
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void buscarReceita()}
                  disabled={consultandoReceita || !cnpjValido(cnpjAtual ?? "")}
                  title="Preenche razão social, CNAEs e UF com os dados da Receita Federal"
                  className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-[10px] border border-line bg-surface px-3 text-[12.5px] font-medium text-text-900 transition hover:border-brand-500/50 hover:text-brand-500 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-line disabled:hover:text-text-900"
                >
                  {consultandoReceita ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Search className="h-3.5 w-3.5" />
                  )}
                  Buscar na Receita
                </button>
              </div>
            )}
          />
          {erroReceita && (
            <span role="alert" className="text-[12px] font-medium text-red-500">
              {erroReceita}
            </span>
          )}
          {situacaoReceita && (
            <div className="flex items-start gap-2 rounded-[10px] border border-amber-500/40 bg-amber-500/10 px-3 py-2.5">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
              <span className="text-[12px] font-medium leading-snug text-amber-700">
                Atenção: situação cadastral {situacaoReceita} na Receita Federal.
              </span>
            </div>
          )}
        </Campo>
      </div>

      <Campo label="CNAE principal" erro={formState.errors.cnaePrincipal?.message}>
        <Controller
          control={control}
          name="cnaePrincipal"
          render={({ field }) => (
            <CnaeCombobox
              multi={false}
              selecionados={field.value ? [field.value] : []}
              onChange={(c) => field.onChange(c[0] ?? "")}
              placeholder="Busque por código ou atividade (ex.: 49.30-2, transporte)"
              extras={cnaesExtras}
            />
          )}
        />
        {(linhaMatriz || cnaeInfo) && (
          <div className="mt-1 rounded-[10px] border-l-[3px] border-brand-500 bg-brand-500/5 px-3.5 py-2.5">
            <p className="text-[12px] leading-relaxed text-text-900">
              {linhaMatriz
                ? <>Esta empresa usa a linha da matriz: <span className="font-medium">{linhaMatriz}</span>{matriz && "…"}</>
                : <>CNAE <span className="font-mono tabular">{cnaePrincipal}</span> — {cnaeInfo?.descricao}</>}
            </p>
            {perfil === "admin" && (
              <Link to="/app/regras" className="mt-1 inline-block text-[12px] font-medium text-brand-500 hover:underline">
                Ver linha completa na matriz →
              </Link>
            )}
          </div>
        )}
      </Campo>

      <Campo label="CNAEs secundários" helper="Opcional — até 20 atividades complementares.">
        <Controller
          control={control}
          name="cnaesSecundarios"
          render={({ field }) => (
            <CnaeCombobox
              multi
              selecionados={field.value}
              onChange={field.onChange}
              placeholder="Adicionar CNAE secundário…"
              extras={cnaesExtras}
            />
          )}
        />
      </Campo>

      <Campo label="Regime tributário" erro={formState.errors.regimeTributario?.message}>
        <div className="grid gap-2.5 sm:grid-cols-3">
          {REGIMES.map((regime) => {
            const ativo = regimeAtual === regime.valor
            return (
              <motion.button
                key={regime.valor}
                type="button"
                onClick={() => escolherRegime(regime.valor)}
                whileTap={{ scale: 0.98 }}
                className={cn(
                  "relative flex flex-col gap-1 rounded-[12px] border p-3.5 text-left transition-colors",
                  ativo ? "border-brand-500 bg-brand-500/5" : "border-line bg-surface hover:border-text-500/40",
                )}
              >
                {ativo && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 400, damping: 20 }}
                    className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-brand-500 text-white"
                  >
                    <Check className="h-3 w-3" />
                  </motion.span>
                )}
                <span className="text-[13px] font-semibold text-text-900">{regime.rotulo}</span>
                <span className="text-[11.5px] leading-snug text-text-500">{regime.dica}</span>
              </motion.button>
            )
          })}
        </div>
      </Campo>

      <Campo label="UF" erro={formState.errors.uf?.message}>
        <Controller
          control={control}
          name="uf"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger className="h-11 rounded-[10px] border-line">
                <SelectValue placeholder="Selecione a UF" />
              </SelectTrigger>
              <SelectContent>
                {UFS_BRASIL.map((uf) => (
                  <SelectItem key={uf} value={uf}>
                    {uf}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </Campo>

      <div className="flex items-center justify-end gap-3 border-t border-line pt-4">
        <button
          type="submit"
          disabled={salvando || (modo === "editar" && !formState.isDirty)}
          className="inline-flex h-11 items-center gap-2 rounded-[10px] bg-brand-500 px-5 text-sm font-semibold text-white transition hover:-translate-y-px hover:bg-brand-500/90 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
        >
          {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
          {submitLabel ?? (modo === "criar" ? "Cadastrar empresa" : "Salvar alterações")}
        </button>
      </div>

      {/* Confirmação de troca de regime (edição) */}
      <Dialog open={pendenteRegime !== null} onOpenChange={(open) => !open && setPendenteRegime(null)}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Alterar regime tributário?</DialogTitle>
            <DialogDescription>
              Alterar o regime afeta classificações futuras. Despesas já processadas mantêm a regra da data do fato gerador.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setPendenteRegime(null)}
              className="inline-flex h-10 items-center rounded-[10px] border border-line px-4 text-sm font-medium text-text-900 transition hover:bg-paper"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => {
                if (pendenteRegime) setValue("regimeTributario", pendenteRegime, { shouldDirty: true })
                setPendenteRegime(null)
              }}
              className="inline-flex h-10 items-center rounded-[10px] bg-brand-500 px-4 text-sm font-semibold text-white transition hover:bg-brand-500/90"
            >
              Confirmar alteração
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  )
}

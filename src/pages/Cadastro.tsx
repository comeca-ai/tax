import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate } from "react-router"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { AnimatePresence, motion } from "framer-motion"
import {
  ArrowRight,
  Building2,
  Calculator,
  Check,
  Eye,
  EyeOff,
  Info,
  Loader2,
  Lock,
  Mail,
  ScanLine,
  Search,
  TriangleAlert,
  Upload,
  User,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { trpc } from "@/providers/trpc"
import { useAuth } from "@/hooks/useAuth"
import { REGIMES_TRIBUTARIOS, UFS_BRASIL } from "@contracts/types"
import type { CnaeReceita, RegimeTributario, Uf } from "@contracts/types"
import { buscarCnaes, cnaePorCodigo } from "@/lib/cnaes"
import type { Cnae } from "@/lib/cnaes"
import { cnpjValido, mascaraCnpj } from "@/lib/cnpj"
import { useConsultaCnpj } from "@/lib/useConsultaCnpj"
import { cn } from "@/lib/utils"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

// ─────────────────────────────────────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────────────────────────────────────

const contaSchema = z
  .object({
    nome: z.string().min(3, "Informe seu nome completo"),
    email: z.string().email("Formato de e-mail inválido"),
    senha: z.string().min(8, "A senha tem no mínimo 8 caracteres"),
    confirmarSenha: z.string(),
  })
  .refine((v) => v.senha === v.confirmarSenha, {
    path: ["confirmarSenha"],
    message: "As senhas não coincidem",
  })
type ContaForm = z.infer<typeof contaSchema>

const empresaSchema = z.object({
  razaoSocial: z.string().min(2, "Informe a razão social ou nome fantasia"),
  cnpj: z.string().refine(cnpjValido, "CNPJ inválido"),
  cnaePrincipal: z.string().min(1, "Selecione o CNAE principal"),
  cnaesSecundarios: z.array(z.string()),
  regimeTributario: z.enum(REGIMES_TRIBUTARIOS, "Selecione o regime tributário"),
  uf: z.enum(UFS_BRASIL, "Selecione a UF"),
  aceiteLgpd: z
    .boolean()
    .refine((v) => v, "É necessário consentir com o tratamento de dados (LGPD)"),
  declaracaoPoderes: z
    .boolean()
    .refine((v) => v, "É necessário declarar poderes para representar a empresa"),
})
type EmpresaForm = z.infer<typeof empresaSchema>

// ─────────────────────────────────────────────────────────────────────────────
// Dados estáticos
// ─────────────────────────────────────────────────────────────────────────────

const UF_NOMES: Record<Uf, string> = {
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia",
  CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás",
  MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul", MG: "Minas Gerais",
  PA: "Pará", PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí",
  RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RS: "Rio Grande do Sul",
  RO: "Rondônia", RR: "Roraima", SC: "Santa Catarina", SP: "São Paulo",
  SE: "Sergipe", TO: "Tocantins",
}

const REGIMES: { valor: RegimeTributario; rotulo: string; dica: string }[] = [
  { valor: "simples_nacional", rotulo: "Simples Nacional", dica: "Tributação unificada; créditos limitados pelo regime." },
  { valor: "lucro_presumido", rotulo: "Lucro Presumido", dica: "PIS/COFINS cumulativo; dedutibilidade das despesas." },
  { valor: "lucro_real", rotulo: "Lucro Real", dica: "Créditos de PIS/COFINS regime não-cumulativo." },
]

const regimeRotulo = (v: RegimeTributario) => REGIMES.find((r) => r.valor === v)?.rotulo ?? v

const CHECKLIST_BRAND = [
  "Conta própria com e-mail e senha",
  "Banco de dados provisionado automaticamente",
  "OCR de notas incluído",
  "Matriz de elegibilidade com base legal",
]

// ─────────────────────────────────────────────────────────────────────────────
// Componentes auxiliares
// ─────────────────────────────────────────────────────────────────────────────

function BrandPanel() {
  return (
    <div
      className="relative hidden flex-col justify-between overflow-hidden bg-ink-900 p-10 lg:flex lg:w-[55%] xl:p-14"
      style={{
        backgroundImage: "url(/auth-texture.svg)",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <motion.div
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <Link to="/" aria-label="reembolsa.ia — voltar ao início">
          <img src="/logo.svg" alt="reembolsa.ia" className="h-8 w-auto" />
        </Link>
      </motion.div>

      <div className="max-w-[440px]">
        <motion.h2
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.12, ease: "easeOut" }}
          className="font-display text-[32px] font-semibold leading-tight tracking-[-0.02em] text-text-dark-100"
        >
          Cadastro em 3 minutos. Créditos pelo resto do ano.
        </motion.h2>
        <ul className="mt-7 flex flex-col gap-3.5">
          {CHECKLIST_BRAND.map((item, i) => (
            <motion.li
              key={item}
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.22 + i * 0.09, ease: "easeOut" }}
              className="flex items-center gap-3 text-[15px] text-text-dark-400"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-400/15">
                <Check className="h-3.5 w-3.5 text-brand-400" />
              </span>
              {item}
            </motion.li>
          ))}
        </ul>
      </div>

      <p className="font-mono text-[11px] tracking-[0.02em] text-text-dark-400">
        Multi-empresa: adicione outras empresas depois, em Empresas.
      </p>
    </div>
  )
}

function ProgressoHeader({ passo }: { passo: number }) {
  const passos = ["Sua conta", "Sua empresa", "Pronto"]
  return (
    <div className="mb-8 flex items-center">
      {passos.map((rotulo, i) => {
        const concluido = i < passo
        const ativo = i === passo
        return (
          <div key={rotulo} className={cn("flex items-center", i > 0 && "flex-1")}>
            {i > 0 && (
              <div className="relative mx-2 h-px flex-1 bg-line">
                <motion.div
                  className="absolute inset-y-0 left-0 bg-brand-500"
                  initial={false}
                  animate={{ width: i <= passo ? "100%" : "0%" }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                />
              </div>
            )}
            <div className="flex items-center gap-2">
              <motion.span
                key={`${i}-${ativo}`}
                initial={ativo ? { scale: 0.8 } : false}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 15 }}
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full font-mono text-[11px] font-semibold tabular",
                  ativo && "bg-brand-500 text-white",
                  concluido && "bg-brand-500 text-white",
                  !ativo && !concluido && "border border-line text-text-500",
                )}
              >
                {concluido ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </motion.span>
              <span
                className={cn(
                  "hidden text-[12px] font-medium sm:block",
                  ativo ? "text-text-900" : "text-text-500",
                )}
              >
                {i + 1} · {rotulo}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ErroCampo({ mensagem }: { mensagem?: string }) {
  return (
    <AnimatePresence>
      {mensagem && (
        <motion.p
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2 }}
          className="overflow-hidden text-[12px] font-medium text-red-500"
        >
          {mensagem}
        </motion.p>
      )}
    </AnimatePresence>
  )
}

function campoClasse(invalido: boolean) {
  return cn(
    "h-11 w-full rounded-[10px] border bg-surface pl-10 pr-3.5 text-sm text-text-900 outline-none transition-[border,box-shadow] duration-150 placeholder:text-text-500/60",
    invalido
      ? "border-red-500 focus:shadow-[0_0_0_3px_rgba(220,38,38,0.14)]"
      : "border-line focus:border-brand-500 focus:shadow-[0_0_0_3px_rgba(14,169,104,0.18)]",
  )
}

/** Combobox buscável de CNAE (single ou multi), navegável por teclado. */
function CnaeCombobox({
  multi,
  selecionados,
  onChange,
  placeholder,
  extras,
}: {
  multi: boolean
  selecionados: string[]
  onChange: (codigos: string[]) => void
  placeholder: string
  /** CNAEs fora da lista curada (ex.: vindos da Receita, v1.3.0) — entram na busca e nos chips. */
  extras?: Cnae[]
}) {
  const [aberto, setAberto] = useState(false)
  const [termo, setTermo] = useState("")
  const [destaque, setDestaque] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const porCodigo = useMemo(
    () => (codigo: string) =>
      cnaePorCodigo(codigo) ?? extras?.find((e) => e.codigo === codigo),
    [extras],
  )

  const opcoes = useMemo(() => {
    const curadas = buscarCnaes(termo)
    const t = termo.trim().toLowerCase()
    const extrasFiltrados = (extras ?? []).filter(
      (e) =>
        !cnaePorCodigo(e.codigo) &&
        (!t || e.codigo.toLowerCase().includes(t) || e.descricao.toLowerCase().includes(t)),
    )
    return [...extrasFiltrados, ...curadas].filter((c) => !selecionados.includes(c.codigo))
  }, [termo, selecionados, extras])

  const escolher = (codigo: string) => {
    if (multi) {
      onChange([...selecionados, codigo])
      setTermo("")
      setDestaque(0)
      inputRef.current?.focus()
    } else {
      onChange([codigo])
      setAberto(false)
      setTermo("")
    }
  }

  const valorUnico = !multi && selecionados[0] ? porCodigo(selecionados[0]) : undefined

  return (
    <div className="relative">
      {/* Chips selecionados */}
      {selecionados.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selecionados.map((codigo) => {
            const cnae = porCodigo(codigo)
            return (
              <span
                key={codigo}
                className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-brand-500/10 py-1 pl-2.5 pr-1.5 text-[12px] font-medium text-brand-500 ring-1 ring-brand-500/30"
              >
                <span className="font-mono tabular">{codigo}</span>
                <span className="max-w-[220px] truncate">{cnae?.descricao ?? ""}</span>
                <button
                  type="button"
                  aria-label={`Remover CNAE ${codigo}`}
                  onClick={() => onChange(selecionados.filter((c) => c !== codigo))}
                  className="flex h-4 w-4 items-center justify-center rounded-full transition-colors hover:bg-brand-500/20"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )
          })}
        </div>
      )}

      {!(valorUnico && !aberto) && (
        <input
          ref={inputRef}
          type="text"
          value={termo}
          placeholder={placeholder}
          onFocus={() => setAberto(true)}
          onBlur={() => setTimeout(() => setAberto(false), 150)}
          onChange={(e) => {
            setTermo(e.target.value)
            setDestaque(0)
            setAberto(true)
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault()
              setDestaque((d) => Math.min(d + 1, opcoes.length - 1))
            } else if (e.key === "ArrowUp") {
              e.preventDefault()
              setDestaque((d) => Math.max(d - 1, 0))
            } else if (e.key === "Enter") {
              e.preventDefault()
              const opcao = opcoes[destaque]
              if (opcao) escolher(opcao.codigo)
            } else if (e.key === "Escape") {
              setAberto(false)
            }
          }}
          className={cn(
            "h-11 w-full rounded-[10px] border border-line bg-surface px-3.5 text-sm text-text-900 outline-none transition-[border,box-shadow] duration-150 placeholder:text-text-500/60",
            "focus:border-brand-500 focus:shadow-[0_0_0_3px_rgba(14,169,104,0.18)]",
          )}
        />
      )}

      {valorUnico && !aberto && (
        <button
          type="button"
          onClick={() => {
            setAberto(true)
            setTimeout(() => inputRef.current?.focus(), 0)
          }}
          className="text-[12px] font-medium text-text-500 transition-colors hover:text-brand-500"
        >
          Trocar CNAE principal
        </button>
      )}

      <AnimatePresence>
        {aberto && opcoes.length > 0 && (
          <motion.ul
            initial={{ scaleY: 0.95, opacity: 0 }}
            animate={{ scaleY: 1, opacity: 1 }}
            exit={{ scaleY: 0.95, opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{ transformOrigin: "top" }}
            className="absolute z-20 mt-1.5 max-h-64 w-full overflow-y-auto rounded-[12px] border border-line bg-surface py-1 shadow-card"
          >
            {opcoes.map((cnae, i) => (
              <motion.li
                key={cnae.codigo}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.02, 0.2), duration: 0.15 }}
              >
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => escolher(cnae.codigo)}
                  onMouseEnter={() => setDestaque(i)}
                  className={cn(
                    "flex w-full items-baseline gap-2.5 px-3.5 py-2 text-left text-[13px]",
                    i === destaque ? "bg-paper" : "",
                  )}
                >
                  <span className="shrink-0 font-mono text-[12px] font-medium tabular text-brand-500">
                    {cnae.codigo}
                  </span>
                  <span className="truncate text-text-900">{cnae.descricao}</span>
                </button>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
}

function ForcaSenha({ senha }: { senha: string }) {
  const regras = useMemo(
    () => [
      { rotulo: "8+ caracteres", ok: senha.length >= 8 },
      { rotulo: "letra maiúscula", ok: /[A-Z]/.test(senha) },
      { rotulo: "número", ok: /\d/.test(senha) },
    ],
    [senha],
  )
  const extra = senha.length >= 12 || /[^A-Za-z0-9]/.test(senha)
  const nivel = senha ? regras.filter((r) => r.ok).length + (extra ? 1 : 0) : 0
  const cor =
    nivel <= 1 ? "bg-red-500" : nivel === 2 ? "bg-amber-500" : "bg-brand-500"

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <motion.span
            key={i}
            className={cn("h-1.5 flex-1 rounded-full", i < nivel ? cor : "bg-line")}
            initial={false}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.2 }}
          />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {regras.map((r) => (
          <li
            key={r.rotulo}
            className={cn(
              "flex items-center gap-1.5 text-[12px] transition-colors",
              r.ok ? "font-medium text-brand-500" : "text-text-500",
            )}
          >
            <Check className={cn("h-3 w-3", r.ok ? "opacity-100" : "opacity-30")} />
            {r.rotulo}
          </li>
        ))}
        <li className="w-full font-mono text-[11px] tracking-[0.02em] text-text-500">
          use uma senha única
        </li>
      </ul>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Página
// ─────────────────────────────────────────────────────────────────────────────

const stepVariants = {
  enter: { x: 40, opacity: 0 },
  center: { x: 0, opacity: 1 },
  exit: { x: -40, opacity: 0 },
}

export default function Cadastro() {
  const navigate = useNavigate()
  const utils = trpc.useUtils()
  const { isAuthenticated } = useAuth()
  const [passo, setPasso] = useState(0)
  const [conta, setConta] = useState<ContaForm | null>(null)
  const [empresa, setEmpresa] = useState<EmpresaForm | null>(null)
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  // ── Passo 1 — conta ────────────────────────────────────────────────────────
  const contaForm = useForm<ContaForm>({
    resolver: zodResolver(contaSchema),
    mode: "onChange",
    defaultValues: conta ?? { nome: "", email: "", senha: "", confirmarSenha: "" },
  })
  const senhaAtual = contaForm.watch("senha")
  const [mostrarSenha, setMostrarSenha] = useState(false)

  // ── Passo 2 — empresa ──────────────────────────────────────────────────────
  const empresaForm = useForm<EmpresaForm>({
    resolver: zodResolver(empresaSchema),
    mode: "onChange",
    defaultValues: empresa ?? {
      razaoSocial: "",
      cnpj: "",
      cnaePrincipal: "",
      cnaesSecundarios: [],
      regimeTributario: undefined as unknown as RegimeTributario,
      uf: undefined as unknown as Uf,
      aceiteLgpd: false,
      declaracaoPoderes: false,
    },
  })

  const registro = trpc.auth.registro.useMutation()
  const criarEmpresa = trpc.empresas.create.useMutation()

  // ── Consulta de CNPJ na Receita (v1.3.0) ───────────────────────────────
  const { consultar, carregando: consultandoReceita, erro: erroReceita } = useConsultaCnpj()
  const [situacaoReceita, setSituacaoReceita] = useState<string | null>(null)
  /** CNAEs retornados pela Receita que não constam na lista curada. */
  const [cnaesExtras, setCnaesExtras] = useState<Cnae[]>([])

  const buscarReceita = async () => {
    const cnpj = empresaForm.getValues("cnpj") ?? ""
    if (!cnpjValido(cnpj)) return
    const dados = await consultar(cnpj)
    if (!dados) return

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

    empresaForm.setValue("razaoSocial", dados.razaoSocial, { shouldValidate: true })
    if (dados.cnaePrincipal) {
      empresaForm.setValue("cnaePrincipal", dados.cnaePrincipal.codigo, { shouldValidate: true })
    }
    empresaForm.setValue("cnaesSecundarios", dados.cnaesSecundarios.map((c) => c.codigo), {
      shouldValidate: true,
    })
    if (dados.uf && (UFS_BRASIL as readonly string[]).includes(dados.uf)) {
      empresaForm.setValue("uf", dados.uf as Uf, { shouldValidate: true })
    }
    setSituacaoReceita(dados.situacao && dados.situacao !== "ATIVA" ? dados.situacao : null)
    toast.success("Dados da Receita Federal preenchidos — confira e ajuste se precisar.")
  }

  // Já autenticado ao chegar na página (ex.: voltou depois de logado) → vai ao app.
  useEffect(() => {
    if (isAuthenticated && passo === 0 && !conta) {
      navigate("/app/dashboard", { replace: true })
    }
  }, [isAuthenticated, passo, conta, navigate])

  const avancarConta = contaForm.handleSubmit((values) => {
    setConta(values)
    setErroGeral(null)
    setPasso(1)
  })

  const finalizar = empresaForm.handleSubmit(async (values) => {
    if (!conta) return
    setErroGeral(null)
    setEnviando(true)
    try {
      const usuario = await registro.mutateAsync({
        nome: conta.nome,
        email: conta.email,
        senha: conta.senha,
      })
      utils.auth.me.setData(undefined, usuario)
    } catch (error) {
      setEnviando(false)
      const code = (error as { data?: { code?: string } }).data?.code
      if (code === "CONFLICT") {
        // E-mail duplicado: volta ao passo 1 com erro inline no campo.
        contaForm.setError("email", {
          type: "manual",
          message: "Este e-mail já está cadastrado. Tente entrar na sua conta.",
        })
        setPasso(0)
      } else {
        setErroGeral("Não foi possível criar sua conta agora. Tente novamente em instantes.")
      }
      return
    }
    try {
      await criarEmpresa.mutateAsync(values)
      await utils.empresas.list.invalidate()
      setEmpresa(values)
      setPasso(2)
      toast.success("Conta criada. Bem-vindo(a)!")
    } catch {
      setErroGeral(
        "Sua conta foi criada, mas houve uma falha ao cadastrar a empresa. Tente novamente.",
      )
    } finally {
      setEnviando(false)
    }
  })

  const primeiroNome = conta?.nome.trim().split(/\s+/)[0] ?? ""

  return (
    <div className="flex min-h-[100dvh] bg-paper">
      <BrandPanel />

      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <motion.div
          initial={{ x: 32, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.15, ease: "easeOut" }}
          className="w-full max-w-[480px]"
        >
          <Link to="/" className="mb-8 flex items-center gap-2.5 lg:hidden" aria-label="Voltar ao início">
            <img src="/logo-mark.svg" alt="" className="h-8 w-8" />
            <span className="font-display text-lg font-semibold tracking-[-0.01em] text-text-900">
              reembolsa<span className="text-brand-500">.ia</span>
            </span>
          </Link>

          <ProgressoHeader passo={passo} />

          <AnimatePresence mode="wait">
            {passo === 0 && (
              <motion.div
                key="passo-1"
                variants={stepVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.25, ease: "easeOut" }}
              >
                <h1 className="font-display text-[26px] font-semibold tracking-[-0.02em] text-text-900">
                  Crie sua conta
                </h1>
                <p className="mt-1.5 text-sm text-text-500">Seu acesso é pessoal e intransferível.</p>

                <form onSubmit={avancarConta} className="mt-6 flex flex-col gap-4" noValidate>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="cad-nome" className="text-[13px] font-medium text-text-900">
                      Nome completo
                    </label>
                    <div className="relative">
                      <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-500" />
                      <input
                        id="cad-nome"
                        type="text"
                        autoComplete="name"
                        placeholder="Seu nome"
                        aria-invalid={Boolean(contaForm.formState.errors.nome)}
                        className={campoClasse(Boolean(contaForm.formState.errors.nome))}
                        {...contaForm.register("nome")}
                      />
                    </div>
                    <ErroCampo mensagem={contaForm.formState.errors.nome?.message} />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="cad-email" className="text-[13px] font-medium text-text-900">
                      E-mail
                    </label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-500" />
                      <input
                        id="cad-email"
                        type="email"
                        autoComplete="email"
                        placeholder="voce@empresa.com.br"
                        aria-invalid={Boolean(contaForm.formState.errors.email)}
                        className={campoClasse(Boolean(contaForm.formState.errors.email))}
                        {...contaForm.register("email")}
                      />
                    </div>
                    <ErroCampo mensagem={contaForm.formState.errors.email?.message} />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="cad-senha" className="text-[13px] font-medium text-text-900">
                      Senha
                    </label>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-500" />
                      <input
                        id="cad-senha"
                        type={mostrarSenha ? "text" : "password"}
                        autoComplete="new-password"
                        placeholder="Mínimo 8 caracteres"
                        aria-invalid={Boolean(contaForm.formState.errors.senha)}
                        className={cn(campoClasse(Boolean(contaForm.formState.errors.senha)), "pr-11")}
                        {...contaForm.register("senha")}
                      />
                      <button
                        type="button"
                        aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
                        onClick={() => setMostrarSenha((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-text-500 transition-colors hover:text-text-900"
                      >
                        {mostrarSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <ForcaSenha senha={senhaAtual ?? ""} />
                    <ErroCampo mensagem={contaForm.formState.errors.senha?.message} />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="cad-confirmar" className="text-[13px] font-medium text-text-900">
                      Confirmar senha
                    </label>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-500" />
                      <input
                        id="cad-confirmar"
                        type={mostrarSenha ? "text" : "password"}
                        autoComplete="new-password"
                        placeholder="Repita a senha"
                        aria-invalid={Boolean(contaForm.formState.errors.confirmarSenha)}
                        className={campoClasse(Boolean(contaForm.formState.errors.confirmarSenha))}
                        {...contaForm.register("confirmarSenha")}
                      />
                    </div>
                    <ErroCampo mensagem={contaForm.formState.errors.confirmarSenha?.message} />
                  </div>

                  <motion.button
                    type="submit"
                    disabled={!contaForm.formState.isValid}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="mt-1 inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-[10px] bg-brand-500 text-sm font-semibold text-white transition hover:bg-brand-500/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Continuar <ArrowRight className="h-4 w-4" />
                  </motion.button>
                </form>

                <p className="mt-6 text-center text-sm text-text-500">
                  Já tem conta?{" "}
                  <Link to="/login" className="font-semibold text-brand-500 hover:underline">
                    Entrar
                  </Link>
                </p>
              </motion.div>
            )}

            {passo === 1 && (
              <motion.div
                key="passo-2"
                variants={stepVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.25, ease: "easeOut" }}
              >
                <h1 className="font-display text-[26px] font-semibold tracking-[-0.02em] text-text-900">
                  Dados da empresa
                </h1>
                <p className="mt-1.5 text-sm leading-relaxed text-text-500">
                  O motor de créditos só processa com o cadastro fiscal completo — é ele que define a elegibilidade.
                </p>

                <form onSubmit={finalizar} className="mt-6 flex flex-col gap-4" noValidate>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="cad-razao" className="text-[13px] font-medium text-text-900">
                      Razão social ou nome fantasia
                    </label>
                    <div className="relative">
                      <Building2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-500" />
                      <input
                        id="cad-razao"
                        type="text"
                        autoComplete="organization"
                        placeholder="Ex.: TransRocha Logística LTDA"
                        aria-invalid={Boolean(empresaForm.formState.errors.razaoSocial)}
                        className={campoClasse(Boolean(empresaForm.formState.errors.razaoSocial))}
                        {...empresaForm.register("razaoSocial")}
                      />
                    </div>
                    <ErroCampo mensagem={empresaForm.formState.errors.razaoSocial?.message} />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="cad-cnpj" className="text-[13px] font-medium text-text-900">
                      CNPJ
                    </label>
                    <div className="flex items-start gap-2">
                      <input
                        id="cad-cnpj"
                        type="text"
                        inputMode="numeric"
                        placeholder="00.000.000/0000-00"
                        aria-invalid={Boolean(empresaForm.formState.errors.cnpj)}
                        className={cn(
                          "h-11 w-full rounded-[10px] border bg-surface px-3.5 font-mono text-sm tabular text-text-900 outline-none transition-[border,box-shadow] duration-150 placeholder:text-text-500/60",
                          empresaForm.formState.errors.cnpj
                            ? "border-red-500 focus:shadow-[0_0_0_3px_rgba(220,38,38,0.14)]"
                            : "border-line focus:border-brand-500 focus:shadow-[0_0_0_3px_rgba(14,169,104,0.18)]",
                        )}
                        {...empresaForm.register("cnpj", {
                          onChange: (e) => {
                            e.target.value = mascaraCnpj(e.target.value)
                          },
                        })}
                      />
                      <button
                        type="button"
                        onClick={() => void buscarReceita()}
                        disabled={consultandoReceita || !cnpjValido(empresaForm.watch("cnpj") ?? "")}
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
                    <ErroCampo mensagem={empresaForm.formState.errors.cnpj?.message} />
                    {erroReceita && (
                      <p role="alert" className="text-[12px] font-medium text-red-500">
                        {erroReceita}
                      </p>
                    )}
                    {situacaoReceita && (
                      <div className="flex items-start gap-2 rounded-[10px] border border-amber-500/40 bg-amber-500/10 px-3 py-2.5">
                        <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                        <span className="text-[12px] font-medium leading-snug text-amber-700">
                          Atenção: situação cadastral {situacaoReceita} na Receita Federal.
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[13px] font-medium text-text-900">CNAE principal</label>
                    <CnaeCombobox
                      multi={false}
                      selecionados={empresaForm.watch("cnaePrincipal") ? [empresaForm.watch("cnaePrincipal")] : []}
                      onChange={(codigos) =>
                        empresaForm.setValue("cnaePrincipal", codigos[0] ?? "", { shouldValidate: true })
                      }
                      placeholder="Busque por código ou atividade… ex.: 49.30-2 ou transporte"
                      extras={cnaesExtras}
                    />
                    <p className="text-[12px] text-text-500">
                      O CNAE define a linha da matriz de elegibilidade.
                    </p>
                    <ErroCampo mensagem={empresaForm.formState.errors.cnaePrincipal?.message} />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[13px] font-medium text-text-900">
                      CNAEs secundários <span className="font-normal text-text-500">(opcional)</span>
                    </label>
                    <CnaeCombobox
                      multi
                      selecionados={empresaForm.watch("cnaesSecundarios") ?? []}
                      onChange={(codigos) =>
                        empresaForm.setValue("cnaesSecundarios", codigos, { shouldValidate: true })
                      }
                      placeholder="Adicionar outra atividade…"
                      extras={cnaesExtras}
                    />
                    <p className="text-[12px] text-text-500">
                      Adicione se sua empresa opera em mais de uma atividade.
                    </p>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <span className="text-[13px] font-medium text-text-900">Regime tributário</span>
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                      {REGIMES.map((regime) => {
                        const selecionado = empresaForm.watch("regimeTributario") === regime.valor
                        return (
                          <motion.button
                            key={regime.valor}
                            type="button"
                            whileHover={{ y: -2 }}
                            onClick={() =>
                              empresaForm.setValue("regimeTributario", regime.valor, {
                                shouldValidate: true,
                              })
                            }
                            aria-pressed={selecionado}
                            className={cn(
                              "relative flex flex-col gap-1 rounded-[12px] border p-3.5 text-left transition-colors",
                              selecionado
                                ? "border-brand-500 bg-brand-500/5 shadow-[0_0_0_1px_rgba(14,169,104,0.5)]"
                                : "border-line bg-surface hover:border-brand-500/40",
                            )}
                          >
                            {selecionado && (
                              <motion.span
                                initial={{ scale: 0.6, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ duration: 0.25 }}
                                className="absolute right-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand-500"
                              >
                                <Check className="h-3 w-3 text-white" />
                              </motion.span>
                            )}
                            <span className="pr-6 text-[13px] font-semibold text-text-900">
                              {regime.rotulo}
                            </span>
                            <span className="text-[11.5px] leading-snug text-text-500">{regime.dica}</span>
                          </motion.button>
                        )
                      })}
                    </div>
                    <ErroCampo mensagem={empresaForm.formState.errors.regimeTributario?.message} />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[13px] font-medium text-text-900">UF</label>
                    <Select
                      value={empresaForm.watch("uf") ?? ""}
                      onValueChange={(v) => empresaForm.setValue("uf", v as Uf, { shouldValidate: true })}
                    >
                      <SelectTrigger
                        className={cn(
                          "h-11 w-full rounded-[10px] border-line bg-surface text-sm",
                          empresaForm.formState.errors.uf && "border-red-500",
                        )}
                      >
                        <SelectValue placeholder="Selecione o estado" />
                      </SelectTrigger>
                      <SelectContent>
                        {UFS_BRASIL.map((uf) => (
                          <SelectItem key={uf} value={uf}>
                            <span className="font-mono tabular">{uf}</span>
                            <span className="ml-2 text-text-500">{UF_NOMES[uf]}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <ErroCampo mensagem={empresaForm.formState.errors.uf?.message} />
                  </div>

                  <div className="flex items-start gap-2.5 rounded-[10px] bg-blue-500/10 px-3.5 py-3">
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                    <p className="text-[13px] leading-relaxed text-text-900">
                      Sem esses dados a empresa fica como "cadastro incompleto" e o processamento de
                      créditos fica bloqueado (RF-00).
                    </p>
                  </div>

                  <div className="flex flex-col gap-3 rounded-[12px] border border-line bg-surface p-4">
                    <label className="flex cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        {...empresaForm.register("aceiteLgpd")}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-[#0EA968]"
                      />
                      <span className="text-[12.5px] leading-relaxed text-text-900">
                        <span className="font-semibold">Consentimento LGPD.</span> Autorizo o
                        tratamento dos dados pessoais e empresariais informados nesta plataforma
                        para as finalidades de gestão de reembolsos e apuração de créditos,
                        conforme a Política de Privacidade (Lei nº 13.709/2018 — LGPD).
                      </span>
                    </label>
                    <ErroCampo mensagem={empresaForm.formState.errors.aceiteLgpd?.message} />
                    <label className="flex cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        {...empresaForm.register("declaracaoPoderes")}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-[#0EA968]"
                      />
                      <span className="text-[12.5px] leading-relaxed text-text-900">
                        <span className="font-semibold">Declaração de poderes.</span> Declaro que
                        possuo poderes para representar a empresa perante os órgãos legais e
                        fiscais, respondendo pelas informações prestadas neste cadastro.
                      </span>
                    </label>
                    <ErroCampo mensagem={empresaForm.formState.errors.declaracaoPoderes?.message} />
                  </div>

                  {erroGeral && (
                    <p role="alert" className="rounded-[10px] bg-conf-vedado-bg px-3.5 py-3 text-[13px] font-medium text-conf-vedado-text">
                      {erroGeral}
                    </p>
                  )}

                  <div className="mt-1 flex gap-3">
                    <button
                      type="button"
                      onClick={() => setPasso(0)}
                      className="inline-flex h-[52px] items-center rounded-[10px] border border-line px-5 text-sm font-semibold text-text-900 transition-colors hover:bg-paper"
                    >
                      Voltar
                    </button>
                    <motion.button
                      type="submit"
                      disabled={enviando}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="inline-flex h-[52px] flex-1 items-center justify-center gap-2 rounded-[10px] bg-brand-500 text-sm font-semibold text-white transition hover:bg-brand-500/90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {enviando ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" /> Criando…
                        </>
                      ) : (
                        <>
                          Criar empresa e continuar <ArrowRight className="h-4 w-4" />
                        </>
                      )}
                    </motion.button>
                  </div>
                </form>
              </motion.div>
            )}

            {passo === 2 && empresa && (
              <motion.div
                key="passo-3"
                variants={stepVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="flex flex-col items-center text-center"
              >
                <div className="relative mb-6">
                  {[0, 1].map((i) => (
                    <motion.span
                      key={i}
                      initial={{ scale: 1, opacity: 0.5 }}
                      animate={{ scale: 1.6, opacity: 0 }}
                      transition={{ duration: 0.8, delay: 0.4 + i * 0.25 }}
                      className="absolute inset-0 rounded-full border-2 border-brand-500"
                    />
                  ))}
                  <svg viewBox="0 0 64 64" className="h-20 w-20">
                    <motion.circle
                      cx="32"
                      cy="32"
                      r="28"
                      fill="none"
                      stroke="#0EA968"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 0.6, ease: "easeOut" }}
                    />
                    <motion.path
                      d="M20 33 L28.5 41.5 L44 24"
                      fill="none"
                      stroke="#0EA968"
                      strokeWidth="4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 0.4, delay: 0.5, ease: "easeOut" }}
                    />
                  </svg>
                </div>

                <h1 className="font-display text-[26px] font-semibold tracking-[-0.02em] text-text-900">
                  Tudo certo, {primeiroNome}!
                </h1>
                <p className="mt-2 max-w-[380px] text-sm leading-relaxed text-text-500">
                  Sua empresa foi cadastrada e seu banco de dados já está provisionado na plataforma.
                  Nada para instalar.
                </p>

                <div className="mt-6 w-full rounded-[12px] border border-line bg-surface p-4 text-left shadow-card">
                  <dl className="flex flex-col gap-2.5">
                    <div className="flex items-center justify-between gap-4">
                      <dt className="text-[12px] uppercase tracking-[0.04em] text-text-500">Empresa</dt>
                      <dd className="truncate text-[13px] font-medium text-text-900">{empresa.razaoSocial}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <dt className="text-[12px] uppercase tracking-[0.04em] text-text-500">CNPJ</dt>
                      <dd className="font-mono text-[13px] tabular text-text-900">{empresa.cnpj}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <dt className="text-[12px] uppercase tracking-[0.04em] text-text-500">CNAE</dt>
                      <dd>
                        <span className="rounded-full bg-brand-500/10 px-2 py-0.5 font-mono text-[11px] font-medium tabular text-brand-500 ring-1 ring-brand-500/30">
                          {empresa.cnaePrincipal}
                        </span>
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <dt className="text-[12px] uppercase tracking-[0.04em] text-text-500">Regime</dt>
                      <dd>
                        <span className="rounded-full bg-paper px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.03em] text-text-500 ring-1 ring-line">
                          {regimeRotulo(empresa.regimeTributario)}
                        </span>
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <dt className="text-[12px] uppercase tracking-[0.04em] text-text-500">UF</dt>
                      <dd className="font-mono text-[13px] tabular text-text-900">{empresa.uf}</dd>
                    </div>
                  </dl>
                </div>

                <ol className="mt-5 flex w-full flex-col gap-2.5 text-left">
                  {[
                    { icon: Upload, texto: "Suba sua primeira nota fiscal" },
                    { icon: ScanLine, texto: "O OCR extrai os campos" },
                    { icon: Calculator, texto: "Veja o crédito apurado" },
                  ].map((item, i) => (
                    <li key={item.texto} className="flex items-center gap-3 text-[13px] text-text-900">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-500/10 text-brand-500">
                        <item.icon className="h-3.5 w-3.5" />
                      </span>
                      <span>
                        <span className="font-mono text-[12px] tabular text-text-500">{i + 1}. </span>
                        {item.texto}
                      </span>
                    </li>
                  ))}
                </ol>

                <motion.button
                  type="button"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => navigate("/app/dashboard")}
                  className="mt-7 inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-[10px] bg-brand-500 text-sm font-semibold text-white transition hover:bg-brand-500/90"
                >
                  Ir para o dashboard <ArrowRight className="h-4 w-4" />
                </motion.button>
                <p className="mt-3 text-[12px] text-text-500">
                  Veículos são cadastrados depois, na área administrativa
                  (Configurar → Veículos) ou pelo próprio colaborador no WhatsApp.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  )
}

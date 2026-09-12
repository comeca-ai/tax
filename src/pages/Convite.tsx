import { useState } from "react"
import { Link, useNavigate, useParams } from "react-router"
import { useQuery } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { AnimatePresence, motion } from "framer-motion"
import {
  AlertCircle,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  TriangleAlert,
  User,
  XCircle,
} from "lucide-react"
import { trpc } from "@/providers/trpc"
import { PERFIL_LABELS } from "@contracts/types"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { codigoErroTrpc, mensagemErro, useConvitesClient } from "@/lib/convites"

const aceiteSchema = z
  .object({
    nome: z.string().min(2, "Informe seu nome completo"),
    senha: z.string().min(8, "A senha tem no mínimo 8 caracteres"),
    confirmarSenha: z.string().min(8, "Confirme a senha"),
  })
  .refine((v) => v.senha === v.confirmarSenha, {
    path: ["confirmarSenha"],
    message: "As senhas não coincidem",
  })
type AceiteForm = z.infer<typeof aceiteSchema>

const INPUT_BASE =
  "h-11 w-full rounded-[10px] border bg-surface pl-10 pr-3.5 text-sm text-text-900 outline-none transition-[border,box-shadow] duration-150 placeholder:text-text-500/60"

function inputClasse(invalido: boolean): string {
  return cn(
    INPUT_BASE,
    invalido
      ? "border-red-500 focus:shadow-[0_0_0_3px_rgba(220,38,38,0.14)]"
      : "border-line focus:border-brand-500 focus:shadow-[0_0_0_3px_rgba(14,169,104,0.18)]",
  )
}

/** Força da senha: 0–4 (tamanho, maiúsc/minúsc, dígito, símbolo). */
function forcaSenha(senha: string): number {
  if (!senha) return 0
  let score = 0
  if (senha.length >= 8) score += 1
  if (senha.length >= 12) score += 1
  if (/[a-z]/.test(senha) && /[A-Z]/.test(senha)) score += 1
  if (/\d/.test(senha) || /[^a-zA-Z0-9]/.test(senha)) score += 1
  return Math.min(score, 4)
}

const FORCA_ROTULO = ["Muito fraca", "Fraca", "Razoável", "Boa", "Forte"] as const
const FORCA_COR = [
  "bg-conf-vedado-dot",
  "bg-conf-baixa-dot",
  "bg-conf-media-dot",
  "bg-conf-media-dot",
  "bg-conf-alta-dot",
] as const

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

      <div className="max-w-[420px]">
        <motion.h2
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.12, ease: "easeOut" }}
          className="font-display text-[32px] font-semibold leading-tight tracking-[-0.02em] text-text-dark-100"
        >
          Você foi convidado.
        </motion.h2>
        <motion.p
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.24, ease: "easeOut" }}
          className="mt-3 text-[15px] leading-relaxed text-text-dark-400"
        >
          Crie sua conta para acessar o motor de recuperação tributária sobre as despesas da sua
          empresa — créditos, fila de revisão e relatórios em um só lugar.
        </motion.p>
      </div>

      <p className="font-mono text-[11px] tracking-[0.02em] text-text-dark-400">
        Acesso por convite · dados isolados por empresa · banco provisionado pela plataforma
      </p>
    </div>
  )
}

function EstadoCard({
  icone,
  titulo,
  texto,
  tom,
}: {
  icone: React.ReactNode
  titulo: string
  texto: string
  tom: "erro" | "alerta"
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="flex w-full max-w-[420px] flex-col items-center gap-3 rounded-[14px] border border-line bg-surface px-8 py-12 text-center shadow-card"
    >
      <span
        className={cn(
          "flex h-14 w-14 items-center justify-center rounded-full",
          tom === "erro" ? "bg-conf-vedado-bg text-conf-vedado-text" : "bg-conf-media-bg text-conf-media-text",
        )}
      >
        {icone}
      </span>
      <h1 className="font-display text-xl font-semibold tracking-[-0.01em] text-text-900">{titulo}</h1>
      <p className="text-sm leading-relaxed text-text-500">{texto}</p>
      <Link
        to="/login"
        className="mt-2 inline-flex h-11 items-center gap-2 rounded-[10px] bg-brand-500 px-5 text-sm font-semibold text-white transition hover:-translate-y-px hover:bg-brand-500/90"
      >
        Ir para o login <ArrowRight className="h-4 w-4" />
      </Link>
    </motion.div>
  )
}

export default function Convite() {
  const { token = "" } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const utils = trpc.useUtils()
  const convites = useConvitesClient()
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [erroAceite, setErroAceite] = useState<string | null>(null)
  const [criando, setCriando] = useState(false)
  const [senhaDigitada, setSenhaDigitada] = useState("")

  const consulta = useQuery({
    queryKey: ["convites", "porToken", token],
    queryFn: () => convites.porToken.query({ token }),
    enabled: token.length > 0,
    retry: false,
    staleTime: 60_000,
  })

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AceiteForm>({
    resolver: zodResolver(aceiteSchema),
    defaultValues: { nome: "", senha: "", confirmarSenha: "" },
  })

  const forca = forcaSenha(senhaDigitada)
  const regSenha = register("senha", {
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setSenhaDigitada(e.target.value),
  })

  async function onSubmit(values: AceiteForm) {
    setErroAceite(null)
    setCriando(true)
    try {
      const usuario = await convites.aceitar.mutate({ token, nome: values.nome, senha: values.senha })
      utils.auth.me.setData(undefined, usuario)
      await utils.empresas.list.invalidate()
      navigate("/app")
    } catch (erro) {
      setErroAceite(mensagemErro(erro, "Não foi possível criar sua conta. Tente novamente."))
      setCriando(false)
    }
  }

  const invalido = codigoErroTrpc(consulta.error) === "NOT_FOUND" || token.length === 0

  return (
    <div className="flex min-h-[100dvh] bg-paper">
      <BrandPanel />

      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <Link to="/" className="mb-8 flex items-center gap-2.5 lg:hidden" aria-label="Voltar ao início">
          <img src="/logo-mark.svg" alt="" className="h-8 w-8" />
          <span className="font-display text-lg font-semibold tracking-[-0.01em] text-text-900">
            reembolsa<span className="text-brand-500">.ia</span>
          </span>
        </Link>

        {consulta.isLoading ? (
          <div className="flex w-full max-w-[400px] flex-col gap-4" aria-label="Carregando convite">
            <Skeleton className="h-9 w-3/4 rounded-lg" />
            <Skeleton className="h-4 w-1/2 rounded" />
            <Skeleton className="h-11 w-full rounded-[10px]" />
            <Skeleton className="h-11 w-full rounded-[10px]" />
            <Skeleton className="h-11 w-full rounded-[10px]" />
            <Skeleton className="h-[52px] w-full rounded-[10px]" />
          </div>
        ) : invalido ? (
          <EstadoCard
            tom="erro"
            icone={<XCircle className="h-7 w-7" />}
            titulo="Convite inválido ou já utilizado"
            texto="Este link de convite não é mais válido. Peça um novo convite ao administrador ou entre com sua conta existente."
          />
        ) : consulta.isError ? (
          <EstadoCard
            tom="erro"
            icone={<XCircle className="h-7 w-7" />}
            titulo="Não foi possível validar o convite"
            texto="Verifique sua conexão e tente novamente em instantes."
          />
        ) : consulta.data?.expirado ? (
          <EstadoCard
            tom="alerta"
            icone={<TriangleAlert className="h-7 w-7" />}
            titulo="Convite expirado"
            texto="Este convite passou do prazo de validade. Peça um novo convite ao administrador da sua empresa."
          />
        ) : consulta.data ? (
          <motion.div
            initial={{ x: 32, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" }}
            className="w-full max-w-[400px]"
          >
            <h1 className="font-display text-[28px] font-semibold tracking-[-0.02em] text-text-900">
              Criar sua conta
            </h1>
            <p className="mt-1.5 text-sm text-text-500">
              Complete seu cadastro para aceitar o convite.
            </p>

            {/* E-mail convidado + perfil */}
            <div className="mt-5 flex items-center gap-3 rounded-[12px] border border-line bg-surface px-4 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-500/10 text-brand-500">
                <Mail className="h-4 w-4" />
              </span>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-text-500">
                  Convite para
                </span>
                <span className="truncate font-mono text-[13px] tabular text-text-900">
                  {consulta.data.email}
                </span>
              </div>
              <span className="shrink-0 rounded-full bg-brand-500/10 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.04em] text-brand-500">
                {PERFIL_LABELS[consulta.data.perfil]}
              </span>
            </div>

            <AnimatePresence>
              {erroAceite && (
                <motion.div
                  key="erro"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  role="alert"
                  className="mt-4 flex items-center gap-2.5 rounded-[10px] bg-conf-vedado-bg px-3.5 py-3 text-[13px] font-medium text-conf-vedado-text"
                >
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {erroAceite}
                </motion.div>
              )}
            </AnimatePresence>

            <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="mt-5 flex flex-col gap-4" noValidate>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="convite-nome" className="text-[13px] font-medium text-text-900">
                  Nome completo
                </label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-500" />
                  <input
                    id="convite-nome"
                    type="text"
                    autoComplete="name"
                    placeholder="Seu nome"
                    aria-invalid={Boolean(errors.nome)}
                    className={inputClasse(Boolean(errors.nome))}
                    {...register("nome")}
                  />
                </div>
                {errors.nome && (
                  <p className="text-[12px] font-medium text-red-500">{errors.nome.message}</p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="convite-senha" className="text-[13px] font-medium text-text-900">
                  Senha
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-500" />
                  <input
                    id="convite-senha"
                    type={mostrarSenha ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Mínimo 8 caracteres"
                    aria-invalid={Boolean(errors.senha)}
                    className={cn(inputClasse(Boolean(errors.senha)), "pr-11")}
                    {...regSenha}
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
                {senhaDigitada && (
                  <div className="flex items-center gap-2">
                    <div className="flex flex-1 gap-1">
                      {[0, 1, 2, 3].map((i) => (
                        <span
                          key={i}
                          className={cn(
                            "h-1 flex-1 rounded-full transition-colors",
                            i < forca ? FORCA_COR[forca] : "bg-line",
                          )}
                        />
                      ))}
                    </div>
                    <span className="font-mono text-[11px] text-text-500">{FORCA_ROTULO[forca]}</span>
                  </div>
                )}
                {errors.senha && (
                  <p className="text-[12px] font-medium text-red-500">{errors.senha.message}</p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="convite-confirmar" className="text-[13px] font-medium text-text-900">
                  Confirmar senha
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-500" />
                  <input
                    id="convite-confirmar"
                    type={mostrarSenha ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Repita a senha"
                    aria-invalid={Boolean(errors.confirmarSenha)}
                    className={inputClasse(Boolean(errors.confirmarSenha))}
                    {...register("confirmarSenha")}
                  />
                </div>
                {errors.confirmarSenha && (
                  <p className="text-[12px] font-medium text-red-500">
                    {errors.confirmarSenha.message}
                  </p>
                )}
              </div>

              <motion.button
                type="submit"
                disabled={criando}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-[10px] bg-brand-500 text-sm font-semibold text-white transition hover:bg-brand-500/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {criando ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Criando conta…
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" /> Criar minha conta
                  </>
                )}
              </motion.button>
            </form>

            <p className="mt-6 text-center text-sm text-text-500">
              Já tem conta?{" "}
              <Link to="/login" className="font-semibold text-brand-500 hover:underline">
                Entrar
              </Link>
            </p>
          </motion.div>
        ) : null}
      </div>
    </div>
  )
}

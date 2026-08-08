import { useState } from "react"
import { Link, Navigate, useNavigate } from "react-router"
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
} from "lucide-react"
import { toast } from "sonner"
import { trpc } from "@/providers/trpc"
import { useAuth } from "@/hooks/useAuth"
import { cn } from "@/lib/utils"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

const loginSchema = z.object({
  email: z.string().email("Formato de e-mail inválido"),
  senha: z.string().min(8, "A senha tem no mínimo 8 caracteres"),
})
type LoginForm = z.infer<typeof loginSchema>

const STATS = [
  { valor: "R$ 31.904,12", rotulo: "capturável", cor: "text-brand-400" },
  { valor: "3 despesas", rotulo: "em revisão", cor: "text-amber-500" },
  { valor: "há 2 dias", rotulo: "último acesso", cor: "text-text-dark-100" },
]

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
          Bem-vindo de volta.
        </motion.h2>
        <motion.p
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.24, ease: "easeOut" }}
          className="mt-3 text-[15px] leading-relaxed text-text-dark-400"
        >
          Seus créditos, sua fila de revisão e suas empresas — exatamente onde você parou.
        </motion.p>
        <motion.div
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.36, ease: "easeOut" }}
          className="mt-8 flex flex-col divide-y divide-line-dark rounded-[14px] border border-line-dark bg-ink-800/60 backdrop-blur-sm"
        >
          {STATS.map((s) => (
            <div key={s.rotulo} className="flex items-baseline justify-between gap-4 px-5 py-3.5">
              <span className={cn("font-mono text-[15px] font-medium tabular", s.cor)}>{s.valor}</span>
              <span className="text-[13px] text-text-dark-400">{s.rotulo}</span>
            </div>
          ))}
        </motion.div>
      </div>

      <p className="font-mono text-[11px] tracking-[0.02em] text-text-dark-400">
        Dados isolados por empresa · sessão segura · banco provisionado pela plataforma
      </p>
    </div>
  )
}

function RecuperarSenhaDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [email, setEmail] = useState("")

  const enviar = () => {
    onOpenChange(false)
    setEmail("")
    toast.success("Se o e-mail existir, enviamos o link. Verifique sua caixa de entrada.")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="font-display">Recuperar senha</DialogTitle>
          <DialogDescription>
            Enviaremos um link de redefinição para seu e-mail.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="recuperar-email" className="text-[13px] font-medium text-text-900">
            E-mail
          </label>
          <Input
            id="recuperar-email"
            type="email"
            placeholder="voce@empresa.com.br"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11 rounded-[10px]"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                enviar()
              }
            }}
          />
        </div>
        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="inline-flex h-10 items-center rounded-[10px] border border-line px-4 text-sm font-semibold text-text-900 transition-colors hover:bg-paper"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={enviar}
            className="inline-flex h-10 items-center rounded-[10px] bg-brand-500 px-4 text-sm font-semibold text-white transition hover:bg-brand-500/90"
          >
            Enviar link
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function Login() {
  const navigate = useNavigate()
  const utils = trpc.useUtils()
  const { isAuthenticated, isLoading } = useAuth()
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [erroLogin, setErroLogin] = useState<string | null>(null)
  const [tentativas, setTentativas] = useState(0)
  const [sucesso, setSucesso] = useState(false)
  const [recuperarAberto, setRecuperarAberto] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", senha: "" },
  })

  const login = trpc.auth.login.useMutation({
    onError: (error) => {
      setTentativas((t) => t + 1)
      setErroLogin(
        error.data?.code === "UNAUTHORIZED"
          ? "E-mail ou senha incorretos. Tente novamente."
          : "Não foi possível entrar agora. Tente novamente em instantes.",
      )
    },
    onSuccess: async (usuario) => {
      setSucesso(true)
      utils.auth.me.setData(undefined, usuario)
      await utils.empresas.list.invalidate()
      setTimeout(() => navigate("/app/dashboard"), 200)
    },
  })

  const onSubmit = handleSubmit((values) => {
    setErroLogin(null)
    login.mutate(values)
  })

  if (!isLoading && isAuthenticated) {
    return <Navigate to="/app/dashboard" replace />
  }

  const submitting = login.isPending

  return (
    <div className="flex min-h-[100dvh] bg-paper">
      <BrandPanel />

      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <motion.div
          initial={{ x: 32, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.15, ease: "easeOut" }}
          className="w-full max-w-[400px]"
        >
          <Link to="/" className="mb-8 flex items-center gap-2.5 lg:hidden" aria-label="Voltar ao início">
            <img src="/logo-mark.svg" alt="" className="h-8 w-8" />
            <span className="font-display text-lg font-semibold tracking-[-0.01em] text-text-900">
              reembolsa<span className="text-brand-500">.ia</span>
            </span>
          </Link>

          <h1 className="font-display text-[28px] font-semibold tracking-[-0.02em] text-text-900">
            Entrar na sua conta
          </h1>
          <p className="mt-1.5 text-sm text-text-500">Use seu e-mail e senha cadastrados.</p>

          <AnimatePresence>
            {erroLogin && (
              <motion.div
                key="erro"
                initial={{ opacity: 0, y: -4 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  x: [0, -6, 6, -6, 6, 0],
                }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                role="alert"
                className="mt-5 flex items-center gap-2.5 rounded-[10px] bg-conf-vedado-bg px-3.5 py-3 text-[13px] font-medium text-conf-vedado-text"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                {erroLogin}
              </motion.div>
            )}
          </AnimatePresence>

          <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4" noValidate>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="login-email" className="text-[13px] font-medium text-text-900">
                E-mail
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-500" />
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  placeholder="voce@empresa.com.br"
                  aria-invalid={Boolean(errors.email || erroLogin)}
                  className={cn(
                    "h-11 w-full rounded-[10px] border bg-surface pl-10 pr-3.5 text-sm text-text-900 outline-none transition-[border,box-shadow] duration-150 placeholder:text-text-500/60",
                    errors.email || erroLogin
                      ? "border-red-500 focus:shadow-[0_0_0_3px_rgba(220,38,38,0.14)]"
                      : "border-line focus:border-brand-500 focus:shadow-[0_0_0_3px_rgba(14,169,104,0.18)]",
                  )}
                  {...register("email")}
                />
              </div>
              {errors.email && <p className="text-[12px] font-medium text-red-500">{errors.email.message}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="login-senha" className="text-[13px] font-medium text-text-900">
                Senha
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-500" />
                <input
                  id="login-senha"
                  type={mostrarSenha ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Sua senha"
                  aria-invalid={Boolean(errors.senha || erroLogin)}
                  className={cn(
                    "h-11 w-full rounded-[10px] border bg-surface pl-10 pr-11 text-sm text-text-900 outline-none transition-[border,box-shadow] duration-150 placeholder:text-text-500/60",
                    errors.senha || erroLogin
                      ? "border-red-500 focus:shadow-[0_0_0_3px_rgba(220,38,38,0.14)]"
                      : "border-line focus:border-brand-500 focus:shadow-[0_0_0_3px_rgba(14,169,104,0.18)]",
                  )}
                  {...register("senha")}
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
              {errors.senha && <p className="text-[12px] font-medium text-red-500">{errors.senha.message}</p>}
            </div>

            <div className="flex items-center justify-between">
              <label className="flex cursor-pointer items-center gap-2 text-[13px] text-text-500">
                <Checkbox className="data-[state=checked]:border-brand-500 data-[state=checked]:bg-brand-500" />
                Manter conectado
              </label>
              <button
                type="button"
                onClick={() => setRecuperarAberto(true)}
                className="text-[13px] font-medium text-blue-500 transition-colors hover:underline"
              >
                Esqueci a senha
              </button>
            </div>

            <motion.button
              type="submit"
              disabled={submitting || sucesso}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-[10px] bg-brand-500 text-sm font-semibold text-white transition hover:bg-brand-500/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sucesso ? (
                <>
                  <Check className="h-4 w-4" /> Entrando…
                </>
              ) : submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Verificando…
                </>
              ) : (
                <>
                  Entrar <ArrowRight className="h-4 w-4" />
                </>
              )}
            </motion.button>

            {tentativas >= 3 && !sucesso && (
              <p className="text-center text-[13px] text-text-500">
                Muitas tentativas?{" "}
                <button
                  type="button"
                  onClick={() => setRecuperarAberto(true)}
                  className="font-medium text-blue-500 hover:underline"
                >
                  Recupere sua senha.
                </button>
              </p>
            )}
          </form>

          <div className="mt-7 flex items-center gap-3">
            <span className="h-px flex-1 bg-line" />
            <span className="text-[12px] uppercase tracking-[0.04em] text-text-500">ou</span>
            <span className="h-px flex-1 bg-line" />
          </div>

          <p className="mt-5 text-center text-sm text-text-500">
            Ainda não tem conta?{" "}
            <Link to="/cadastro" className="font-semibold text-brand-500 hover:underline">
              Criar conta grátis
            </Link>
          </p>

          <p className="mt-8 text-center font-mono text-[11px] leading-relaxed tracking-[0.02em] text-text-500">
            Ao entrar você concorda com os Termos de uso e a Política de privacidade (LGPD).
          </p>

          <p className="mt-4 text-center">
            <Link to="/" className="text-[13px] font-medium text-text-500 transition-colors hover:text-text-900">
              ← Voltar ao início
            </Link>
          </p>
        </motion.div>
      </div>

      <RecuperarSenhaDialog open={recuperarAberto} onOpenChange={setRecuperarAberto} />
    </div>
  )
}

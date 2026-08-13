import { useState } from "react"
import { Link, useNavigate, useParams } from "react-router"
import { motion } from "framer-motion"
import { KeyRound } from "lucide-react"
import { toast } from "sonner"
import { trpc } from "@/providers/trpc"
import { Input } from "@/components/ui/input"

/** Redefinição de senha via link de e-mail (v1.6.1). */
export default function RedefinirSenha() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const [senha, setSenha] = useState("")
  const [confirmar, setConfirmar] = useState("")

  const redefinir = trpc.auth.redefinirSenha.useMutation({
    onSuccess: () => {
      toast.success("Senha redefinida! Entre com a nova senha.")
      navigate("/login", { replace: true })
    },
    onError: (erro) => {
      toast.error("Não foi possível redefinir", {
        description: erro.message || "Link inválido ou expirado. Solicite um novo.",
      })
    },
  })

  function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (senha.length < 8) {
      toast.error("A senha tem no mínimo 8 caracteres")
      return
    }
    if (senha !== confirmar) {
      toast.error("As senhas não conferem")
      return
    }
    if (!token) return
    redefinir.mutate({ token, novaSenha: senha })
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-paper px-4">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="w-full max-w-[400px] rounded-xl border border-line bg-surface p-8 shadow-card"
      >
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-500/10 text-brand-500">
            <KeyRound className="h-5 w-5" />
          </span>
          <h1 className="font-display text-xl font-semibold tracking-[-0.01em] text-text-900">
            Criar nova senha
          </h1>
          <p className="text-sm text-text-500">
            Escolha uma senha nova com no mínimo 8 caracteres.
          </p>
        </div>

        <form onSubmit={enviar} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="nova-senha" className="text-[13px] font-medium text-text-900">
              Nova senha
            </label>
            <Input
              id="nova-senha"
              type="password"
              required
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="••••••••"
              className="h-11 rounded-[10px]"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="confirmar-senha" className="text-[13px] font-medium text-text-900">
              Confirmar senha
            </label>
            <Input
              id="confirmar-senha"
              type="password"
              required
              value={confirmar}
              onChange={(e) => setConfirmar(e.target.value)}
              placeholder="••••••••"
              className="h-11 rounded-[10px]"
            />
          </div>
          <button
            type="submit"
            disabled={redefinir.isPending}
            className="inline-flex h-11 items-center justify-center rounded-[10px] bg-brand-500 px-4 text-sm font-semibold text-white transition hover:bg-brand-500/90 disabled:opacity-50"
          >
            {redefinir.isPending ? "Salvando…" : "Redefinir senha"}
          </button>
        </form>

        <p className="mt-6 text-center text-[13px] text-text-500">
          Lembrou a senha?{" "}
          <Link to="/login" className="font-semibold text-brand-500 hover:underline">
            Voltar ao login
          </Link>
        </p>
      </motion.div>
    </div>
  )
}

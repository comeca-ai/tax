import { Navigate, Outlet } from "react-router"
import { Loader2 } from "lucide-react"
import { useAuth } from "@/hooks/useAuth"

/**
 * Gate da área Equipe (v1.9.1). Diferente de `RequireAdmin`, que protege o que é
 * da plataforma (Regras & Matriz): aqui entra também o administrador da própria
 * empresa — quem criou a empresa monta a equipe dela. A permissão vem calculada
 * do servidor (`auth.me.podeGerenciarEquipe`), a tela não a recalcula.
 */
export default function RequireEquipe() {
  const { podeGerenciarEquipe, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="flex min-h-[50dvh] flex-col items-center justify-center gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-brand-500" aria-hidden />
        <p className="text-sm font-medium text-text-500">Verificando permissão…</p>
      </div>
    )
  }

  if (!podeGerenciarEquipe) {
    return <Navigate to="/app/dashboard" replace />
  }

  return <Outlet />
}

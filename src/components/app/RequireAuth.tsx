import { Navigate, Outlet } from "react-router"
import { Loader2 } from "lucide-react"
import { useAuth } from "@/hooks/useAuth"
import { LOGIN_PATH } from "@/const"

/** Gate de autenticação para todas as rotas /app/*. */
export default function RequireAuth() {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-paper">
        <Loader2 className="h-6 w-6 animate-spin text-brand-500" aria-hidden />
        <p className="text-sm font-medium text-text-500">Verificando sessão…</p>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to={LOGIN_PATH} replace />
  }

  return <Outlet />
}

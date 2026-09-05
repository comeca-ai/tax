import { Navigate, Outlet } from "react-router"
import { Loader2 } from "lucide-react"
import { useAuth } from "@/hooks/useAuth"

/**
 * Gate de perfil para as áreas restritas ao time da plataforma (v1.8.0).
 * Esconder o item da sidebar não impede a URL digitada — quem não é admin é
 * mandado de volta ao dashboard.
 */
export default function RequireAdmin() {
  const { perfil, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="flex min-h-[50dvh] flex-col items-center justify-center gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-brand-500" aria-hidden />
        <p className="text-sm font-medium text-text-500">Verificando permissão…</p>
      </div>
    )
  }

  if (perfil !== "admin") {
    return <Navigate to="/app/dashboard" replace />
  }

  return <Outlet />
}

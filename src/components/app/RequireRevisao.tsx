import { Navigate, Outlet } from "react-router"
import { Loader2 } from "lucide-react"
import { useAuth } from "@/hooks/useAuth"

/**
 * Gate da Fila de Revisão (v1.12.0). Entra quem revisa ALGUMA empresa:
 * aprovador/analista designado, admin da empresa ou admin da plataforma. A
 * permissão vem calculada do servidor (`auth.me.podeRevisarDespesas`), a tela
 * não a recalcula; ter papel na empresa SELECIONADA é checagem do servidor
 * (`revisao.fila` responde FORBIDDEN e a página mostra o empty-state).
 */
export default function RequireRevisao() {
  const { podeRevisarDespesas, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="flex min-h-[50dvh] flex-col items-center justify-center gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-brand-500" aria-hidden />
        <p className="text-sm font-medium text-text-500">Verificando permissão…</p>
      </div>
    )
  }

  if (!podeRevisarDespesas) {
    return <Navigate to="/app/dashboard" replace />
  }

  return <Outlet />
}

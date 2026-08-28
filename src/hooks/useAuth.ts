import { useCallback } from "react"
import { useNavigate } from "react-router"
import { useQueryClient } from "@tanstack/react-query"
import { trpc } from "@/providers/trpc"
import { LOGIN_PATH } from "@/const"

/**
 * Sessão do usuário autenticado, baseada em `trpc.auth.me`.
 * `logout()` limpa o cookie no servidor, esvazia o cache local e volta ao login.
 */
export function useAuth() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const utils = trpc.useUtils()

  const me = trpc.auth.me.useQuery(undefined, {
    retry: false,
    staleTime: 60_000,
  })

  const logoutMutation = trpc.auth.logout.useMutation()

  const logout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync()
    } catch {
      // Mesmo com falha de rede, derruba o estado local de sessão.
    } finally {
      // Remove queries sensíveis (empresas, despesas etc.) e zera a sessão local.
      queryClient.removeQueries()
      utils.auth.me.setData(undefined, null)
      navigate(LOGIN_PATH)
    }
  }, [logoutMutation, navigate, queryClient, utils])

  const user = me.data ?? null

  return {
    user,
    isLoading: me.isLoading,
    isAuthenticated: user !== null,
    perfil: user?.perfil ?? null,
    /** Admin da plataforma ou da própria empresa — libera a área Equipe (v1.9.1). */
    podeGerenciarEquipe: user?.podeGerenciarEquipe ?? false,
    logout,
  }
}

import { useCallback, useMemo, useSyncExternalStore } from "react"
import { trpc } from "@/providers/trpc"
import { getActiveCompanyId, selectCompany, subscribeCompany } from "./activeCompanyStore"

/**
 * Empresas do usuário + empresa ativa (multi-tenant).
 * A empresa ativa fica em estado local persistido em localStorage ("activeCompanyId");
 * se o id salvo não existir mais na lista, cai para a primeira empresa.
 */
export function useActiveCompany() {
  const query = trpc.empresas.list.useQuery(undefined, {
    retry: false,
    staleTime: 30_000,
  })

  const companies = useMemo(() => query.data ?? [], [query.data])
  const activeId = useSyncExternalStore(subscribeCompany, getActiveCompanyId, () => null)

  const setActiveCompanyId = useCallback((id: number) => {
    if (companies.some(company => company.id === id)) selectCompany(id)
  }, [companies])

  // Id salvo inválido/ausente → primeira empresa da lista.
  const activeCompany =
    companies.find((c) => c.id === activeId) ?? companies[0] ?? null

  return {
    activeCompany,
    companies,
    setActiveCompanyId,
    isLoading: query.isLoading,
    error: query.error,
  }
}

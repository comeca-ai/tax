import { useCallback, useMemo, useState } from "react"
import { trpc } from "@/providers/trpc"

const STORAGE_KEY = "activeCompanyId"

function lerIdSalvo(): number | null {
  try {
    const bruto = window.localStorage.getItem(STORAGE_KEY)
    if (!bruto) return null
    const id = Number(bruto)
    return Number.isInteger(id) && id > 0 ? id : null
  } catch {
    return null
  }
}

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
  const [activeId, setActiveId] = useState<number | null>(() => lerIdSalvo())

  const setActiveCompanyId = useCallback((id: number) => {
    setActiveId(id)
    try {
      window.localStorage.setItem(STORAGE_KEY, String(id))
    } catch {
      // localStorage indisponível (modo privado) — mantém só em memória.
    }
  }, [])

  // Id salvo inválido/ausente → primeira empresa da lista.
  const activeCompany =
    companies.find((c) => c.id === activeId) ?? companies[0] ?? null

  return {
    activeCompany,
    companies,
    setActiveCompanyId,
    isLoading: query.isLoading,
  }
}

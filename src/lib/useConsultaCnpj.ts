import { useCallback, useState } from "react"
import { trpc } from "@/providers/trpc"
import type { DadosReceitaCnpj } from "@contracts/types"

/**
 * Consulta de CNPJ na Receita Federal via ReceitaWS (v1.3.0).
 * Wrap da mutation `empresas.consultarCnpj` com estados de carregamento/erro.
 * Em erro, `erro` traz a mensagem PT-BR do backend (ex.: rate limit, CNPJ não
 * encontrado, RECEITAWS_TOKEN ausente) e a Promise resolve `null`.
 */
export function useConsultaCnpj() {
  const mutation = trpc.empresas.consultarCnpj.useMutation()
  const [erro, setErro] = useState<string | null>(null)

  const consultar = useCallback(
    async (cnpj: string): Promise<DadosReceitaCnpj | null> => {
      setErro(null)
      try {
        return await mutation.mutateAsync({ cnpj })
      } catch (e) {
        setErro(
          e instanceof Error
            ? e.message
            : "Não foi possível consultar a Receita agora. Tente novamente.",
        )
        return null
      }
    },
    [mutation],
  )

  return {
    consultar,
    carregando: mutation.isPending,
    erro,
    limparErro: () => setErro(null),
  }
}

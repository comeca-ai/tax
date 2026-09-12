import { trpc } from "@/providers/trpc"
import type { Convite, Perfil } from "@contracts/types"

// ─────────────────────────────────────────────────────────────────────────────
// Contrato do router tRPC `convites` (v1.2.0 — backend entrega em branch separado).
// Como o tipo `AppRouter` deste branch ainda não inclui `convites`, este módulo
// tipa o acesso contra o contrato fechado e reusa o mesmo cliente HTTP
// (httpBatchLink + superjson) do provider — datas chegam como Date.
// ─────────────────────────────────────────────────────────────────────────────

export type ConviteComLink = Convite & { linkAceite?: string; enviadoPorEmail?: boolean }

/** Resposta de `convites.porToken` (query pública). */
export interface ConvitePorToken {
  email: string
  perfil: Perfil
  expirado: boolean
}

/** Resposta de `convites.aceitar` (mutation pública — seta cookie de sessão). */
export interface AceiteResultado {
  id: number
  email: string
  nome: string
  perfil: Perfil
  /** Sempre false no aceite: conta nova ainda não tem empresa (v1.9.1). */
  podeGerenciarEquipe: boolean
  /** True quando a ficha vinculada é a do aprovador/analista designado (v1.12.0). */
  podeRevisarDespesas: boolean
}

interface ConvitesClient {
  criar: { mutate(input: { email: string; perfil: Perfil }): Promise<ConviteComLink> }
  listar: { query(): Promise<Convite[]> }
  revogar: { mutate(input: { id: number }): Promise<void> }
  reenviar: { mutate(input: { id: number }): Promise<ConviteComLink> }
  porToken: { query(input: { token: string }): Promise<ConvitePorToken> }
  aceitar: {
    mutate(input: { token: string; nome: string; senha: string }): Promise<AceiteResultado>
  }
}

/**
 * Cliente tipado do router `convites`, compartilhando conexão e cache com o app.
 * Deve ser chamado dentro de um componente sob o `TRPCProvider`.
 */
export function useConvitesClient(): ConvitesClient {
  const utils = trpc.useUtils()
  return (utils.client as unknown as { convites: ConvitesClient }).convites
}

/** Extrai `data.code` de um erro tRPC (ex.: "NOT_FOUND", "FORBIDDEN"). */
export function codigoErroTrpc(erro: unknown): string | null {
  return (erro as { data?: { code?: string } } | null)?.data?.code ?? null
}

/** Mensagem PT-BR de um erro tRPC, com fallback amigável. */
export function mensagemErro(erro: unknown, fallback: string): string {
  if (erro instanceof Error && erro.message) return erro.message
  return fallback
}

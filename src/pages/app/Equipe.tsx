import { useState } from "react"
import { Link } from "react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AnimatePresence, motion } from "framer-motion"
import {
  Ban,
  Copy,
  Link2,
  MailPlus,
  RefreshCw,
  ShieldAlert,
  Users,
} from "lucide-react"
import { toast } from "sonner"
import {
  PERFIL_LABELS,
  STATUS_CONVITE_LABELS,
  type Convite,
  type Perfil,
  type StatusConvite,
} from "@contracts/types"
import { perfisConvidaveis } from "@contracts/permissoes"
import { useAuth } from "@/hooks/useAuth"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import Colaboradores from "@/components/equipe/Colaboradores"
import {
  mensagemErro,
  useConvitesClient,
  type ConviteComLink,
} from "@/lib/convites"
import { formatDataHora } from "@/components/despesas/meta"

const STATUS_CHIP: Record<StatusConvite, string> = {
  pendente: "bg-conf-media-bg text-conf-media-text",
  aceito: "bg-brand-500/10 text-brand-500",
  revogado: "bg-paper text-text-500 ring-1 ring-line",
}

const STATUS_DOT: Record<StatusConvite, string> = {
  pendente: "bg-conf-media-dot",
  aceito: "bg-conf-alta-dot",
  revogado: "bg-text-500/50",
}

function chipPerfil(perfil: Perfil) {
  return (
    <span className="inline-flex h-6 items-center rounded-full bg-paper px-2.5 font-mono text-[10px] uppercase tracking-[0.04em] text-text-900 ring-1 ring-line">
      {PERFIL_LABELS[perfil]}
    </span>
  )
}

function expirado(convite: Convite): boolean {
  return convite.status === "pendente" && new Date(convite.expiresAt).getTime() < Date.now()
}

async function copiarLink(link: string) {
  try {
    await navigator.clipboard.writeText(link)
    toast.success("Link copiado para a área de transferência")
  } catch {
    toast.error("Não foi possível copiar", { description: link })
  }
}

/** Card com o link de aceite (quando o SMTP não está configurado) + compartilhamento. */
function LinkAceiteCard({ convite, onFechar }: { convite: ConviteComLink; onFechar: () => void }) {
  if (!convite.linkAceite) return null
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="flex flex-col gap-3 rounded-xl border border-brand-500/30 bg-brand-500/5 p-4"
    >
      <div className="flex items-center gap-2">
        <Link2 className="h-4 w-4 text-brand-500" />
        <span className="text-[13px] font-semibold text-text-900">
          Convite criado para {convite.email}
        </span>
        <button
          type="button"
          onClick={onFechar}
          className="ml-auto text-[12px] font-semibold text-text-500 transition hover:text-text-900"
        >
          Fechar
        </button>
      </div>
      <p className="text-[12.5px] leading-snug text-text-500">
        O e-mail automático não está configurado — envie este link de aceite ao convidado:
      </p>
      <div className="rounded-[10px] border border-line bg-surface px-3 py-2.5">
        <span className="break-all font-mono text-[12px] leading-relaxed text-text-900">
          {convite.linkAceite}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void copiarLink(convite.linkAceite ?? "")}
          className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-brand-500 px-4 text-[13px] font-semibold text-white transition hover:-translate-y-px hover:bg-brand-500/90"
        >
          <Copy className="h-4 w-4" /> Copiar link
        </button>
      </div>
    </motion.div>
  )
}

export default function Equipe() {
  const { perfil, podeGerenciarEquipe } = useAuth()
  const queryClient = useQueryClient()
  const convites = useConvitesClient()
  // Perfis da plataforma (Admin, Revisor) alcançam todas as empresas — só o
  // suporte concede. O admin da empresa convida como Cliente (v1.9.1).
  const perfisDisponiveis = perfisConvidaveis(perfil ?? "cliente")

  const [email, setEmail] = useState("")
  const [perfilConvite, setPerfilConvite] = useState<Perfil>("cliente")
  const [resultado, setResultado] = useState<ConviteComLink | null>(null)
  const [revogando, setRevogando] = useState<Convite | null>(null)

  const lista = useQuery({
    queryKey: ["convites", "listar"],
    queryFn: () => convites.listar.query(),
    enabled: podeGerenciarEquipe,
    retry: false,
  })

  function aoErro(erro: unknown, fallback: string) {
    toast.error(fallback, { description: mensagemErro(erro, "Tente novamente em instantes.") })
  }

  const criar = useMutation({
    mutationFn: (input: { email: string; perfil: Perfil }) => convites.criar.mutate(input),
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({ queryKey: ["convites"] })
      setEmail("")
      if (res.enviadoPorEmail) {
        setResultado(null)
        toast.success("Convite enviado por e-mail", { description: res.email })
      } else {
        setResultado(res)
      }
    },
    onError: (erro) => aoErro(erro, "Não foi possível criar o convite"),
  })

  const reenviar = useMutation({
    mutationFn: (input: { id: number }) => convites.reenviar.mutate(input),
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({ queryKey: ["convites"] })
      if (res.enviadoPorEmail) {
        toast.success("Convite reenviado por e-mail", { description: res.email })
      } else if (res.linkAceite) {
        setResultado(res)
      }
    },
    onError: (erro) => aoErro(erro, "Não foi possível reenviar o convite"),
  })

  const revogar = useMutation({
    mutationFn: (input: { id: number }) => convites.revogar.mutate(input),
    onSuccess: async (_r, vars) => {
      await queryClient.invalidateQueries({ queryKey: ["convites"] })
      setRevogando((atual) => (atual?.id === vars.id ? null : atual))
      toast.success("Convite revogado")
    },
    onError: (erro) => aoErro(erro, "Não foi possível revogar o convite"),
  })

  /** "Copiar link" de um convite pendente: gera um novo link via reenvio. */
  async function reenviarECopiar(id: number) {
    try {
      const res = await convites.reenviar.mutate({ id })
      await queryClient.invalidateQueries({ queryKey: ["convites"] })
      if (res.linkAceite) {
        await copiarLink(res.linkAceite)
      } else {
        toast.success("Convite reenviado por e-mail", { description: res.email })
      }
    } catch (erro) {
      aoErro(erro, "Não foi possível gerar um novo link")
    }
  }

  function enviarConvite(e: React.FormEvent) {
    e.preventDefault()
    const limpo = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpo)) {
      toast.error("Informe um e-mail válido")
      return
    }
    criar.mutate({ email: limpo, perfil: perfilConvite })
  }

  if (!podeGerenciarEquipe) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="flex flex-col items-center justify-center gap-4 rounded-xl border border-line bg-surface px-8 py-16 text-center"
      >
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-conf-media-bg text-conf-media-text">
          <ShieldAlert className="h-7 w-7" />
        </span>
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-lg font-medium tracking-[-0.01em] text-text-900">
            Acesso restrito ao administrador da empresa
          </h1>
          <p className="max-w-sm text-sm text-text-500">
            Quem cadastra a empresa administra a equipe dela. Cadastre sua empresa para convidar
            pessoas — ou fale com quem administra a sua.
          </p>
        </div>
        <Link
          to="/app/dashboard"
          className="mt-1 inline-flex h-10 items-center rounded-[10px] bg-brand-500 px-4 text-sm font-semibold text-white transition hover:-translate-y-px hover:bg-brand-500/90"
        >
          Voltar ao dashboard
        </Link>
      </motion.div>
    )
  }

  const itens = lista.data ?? []

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="flex flex-col gap-6"
    >
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-semibold tracking-[-0.01em] text-text-900">
          Equipe
        </h1>
        <p className="text-sm text-text-500">
          Todo convite vai por e-mail: colaboradores enviam despesas, usuários do painel
          administram a operação.
        </p>
      </header>

      {/* Colaboradores — convite por e-mail (v1.9.1) */}
      <Colaboradores />

      <hr className="border-line" />

      {/* Usuários do painel (convites por e-mail) */}
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-lg font-semibold tracking-[-0.01em] text-text-900">
          Usuários do painel
        </h2>
        <p className="text-sm text-text-500">
          Convide administradores, clientes e revisores para acessar a plataforma web.
        </p>
      </header>

      {/* Convidar por e-mail */}
      <form
        onSubmit={enviarConvite}
        className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5 shadow-card sm:flex-row sm:items-end"
      >
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor="equipe-email" className="text-[12px] font-medium uppercase tracking-[0.04em] text-text-500">
            Convidar por e-mail
          </label>
          <input
            id="equipe-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="pessoa@empresa.com.br"
            className="h-11 w-full rounded-[10px] border border-line bg-surface px-3.5 text-sm text-text-900 outline-none transition placeholder:text-text-500/60 focus:border-brand-500 focus:shadow-[0_0_0_3px_rgba(14,169,104,0.18)]"
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:w-56">
          <label className="text-[12px] font-medium uppercase tracking-[0.04em] text-text-500">
            Perfil de acesso
          </label>
          <Select value={perfilConvite} onValueChange={(v) => setPerfilConvite(v as Perfil)}>
            <SelectTrigger className="h-11 w-full border-line text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {perfisDisponiveis.map((p) => (
                <SelectItem key={p} value={p}>
                  {PERFIL_LABELS[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {perfisDisponiveis.length === 1 && (
            <p className="text-[12px] leading-snug text-text-500">
              Admin e Revisor alcançam todas as empresas — quem concede é o suporte.
            </p>
          )}
        </div>
        <button
          type="submit"
          disabled={criar.isPending}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-[10px] bg-brand-500 px-5 text-sm font-semibold text-white transition hover:-translate-y-px hover:bg-brand-500/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <MailPlus className="h-4 w-4" />
          {criar.isPending ? "Enviando…" : "Enviar convite"}
        </button>
      </form>

      {/* Resultado com link (sem SMTP) */}
      <AnimatePresence>
        {resultado?.linkAceite && (
          <LinkAceiteCard convite={resultado} onFechar={() => setResultado(null)} />
        )}
      </AnimatePresence>

      {/* Lista de convites */}
      {lista.isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-14 w-full rounded-xl" />
          <Skeleton className="h-14 w-full rounded-xl" />
          <Skeleton className="h-14 w-full rounded-xl" />
        </div>
      ) : lista.isError ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-line bg-surface px-8 py-12 text-center">
          <p className="text-sm font-medium text-text-900">Não foi possível carregar os convites.</p>
          <button
            type="button"
            onClick={() => void lista.refetch()}
            className="text-[13px] font-semibold text-brand-500 hover:underline"
          >
            Tentar novamente
          </button>
        </div>
      ) : itens.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-line bg-surface px-8 py-16 text-center">
          <img src="/empty-revisao.svg" alt="" className="h-auto w-56" />
          <div className="flex flex-col gap-1">
            <h3 className="font-display text-lg font-medium tracking-[-0.01em] text-text-900">
              Nenhum convite enviado ainda
            </h3>
            <p className="max-w-sm text-sm text-text-500">
              Convide administradores, clientes e revisores para trabalhar na plataforma com você.
            </p>
          </div>
          <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.06em] text-text-500">
            <Users className="h-3.5 w-3.5" /> use o formulário acima
          </span>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-line">
                <th className="h-11 px-4 text-[12px] font-medium uppercase tracking-[0.04em] text-text-500">E-mail</th>
                <th className="h-11 px-4 text-[12px] font-medium uppercase tracking-[0.04em] text-text-500">Perfil</th>
                <th className="h-11 px-4 text-[12px] font-medium uppercase tracking-[0.04em] text-text-500">Status</th>
                <th className="h-11 px-4 text-[12px] font-medium uppercase tracking-[0.04em] text-text-500">Criado em</th>
                <th className="h-11 px-4 text-right text-[12px] font-medium uppercase tracking-[0.04em] text-text-500">Ações</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((c, i) => {
                const exp = expirado(c)
                return (
                  <motion.tr
                    key={c.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, ease: "easeOut", delay: 0.03 * i }}
                    className="h-14 border-b border-line last:border-b-0 hover:bg-paper"
                  >
                    <td className="px-4 font-mono text-[13px] tabular text-text-900">{c.email}</td>
                    <td className="px-4">{chipPerfil(c.perfil)}</td>
                    <td className="px-4">
                      {exp ? (
                        <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-conf-vedado-bg px-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.04em] text-conf-vedado-text">
                          <span className="h-1.5 w-1.5 rounded-full bg-conf-vedado-dot" /> Expirado
                        </span>
                      ) : (
                        <span
                          className={cn(
                            "inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.04em]",
                            STATUS_CHIP[c.status],
                          )}
                        >
                          <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[c.status])} />
                          {STATUS_CONVITE_LABELS[c.status]}
                        </span>
                      )}
                    </td>
                    <td className="px-4 font-mono text-[12px] tabular text-text-500">
                      {formatDataHora(c.createdAt)}
                    </td>
                    <td className="px-4">
                      {c.status === "pendente" && (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => reenviar.mutate({ id: c.id })}
                            disabled={reenviar.isPending}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-semibold text-text-500 transition hover:bg-surface hover:text-text-900 disabled:opacity-50"
                          >
                            <RefreshCw className="h-3.5 w-3.5" /> Reenviar
                          </button>
                          <button
                            type="button"
                            onClick={() => void reenviarECopiar(c.id)}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-semibold text-text-500 transition hover:bg-surface hover:text-text-900"
                          >
                            <Copy className="h-3.5 w-3.5" /> Copiar link
                          </button>
                          <button
                            type="button"
                            onClick={() => setRevogando(c)}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-semibold text-red-500 transition hover:bg-conf-vedado-bg"
                          >
                            <Ban className="h-3.5 w-3.5" /> Revogar
                          </button>
                        </div>
                      )}
                    </td>
                  </motion.tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Confirm revogar */}
      <Dialog open={revogando !== null} onOpenChange={(open) => !open && setRevogando(null)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Revogar convite?</DialogTitle>
            <DialogDescription>
              O link de aceite de <span className="font-mono">{revogando?.email}</span> deixará de
              funcionar imediatamente. Você pode criar um novo convite depois.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setRevogando(null)}
              className="inline-flex h-10 items-center rounded-[10px] border border-line px-4 text-sm font-medium text-text-900 transition hover:bg-paper"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={revogar.isPending}
              onClick={() => revogando && revogar.mutate({ id: revogando.id })}
              className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-red-500 px-4 text-sm font-semibold text-white transition hover:bg-red-500/90 disabled:opacity-50"
            >
              <Ban className="h-4 w-4" />
              {revogar.isPending ? "Revogando…" : "Revogar convite"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}

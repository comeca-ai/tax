import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { motion } from "framer-motion"
import { Link2, Mail, Send, UserPlus } from "lucide-react"
import { toast } from "sonner"
import { trpc } from "@/providers/trpc"
import { useActiveCompany } from "@/hooks/useActiveCompany"
import { Skeleton } from "@/components/ui/skeleton"
import { mensagemErro } from "@/lib/convites"

// ─────────────────────────────────────────────────────────────────────────────
// Colaboradores (v1.6.0; convite reescrito na v1.9.1) — quem pede reembolso.
// O WhatsApp está fora por ora: o convite vai por E-MAIL, com link de aceite
// (`/convite/<token>`) onde a pessoa cria a senha e passa a enxergar a empresa.
// Sem SMTP, a tela mostra o link para o gestor copiar e mandar como quiser.
// ─────────────────────────────────────────────────────────────────────────────

export interface Colaborador {
  id: number
  nome: string
  email: string | null
  telefone: string | null
  matricula: string | null
  centroCusto: string | null
  statusAtivacao: "pendente" | "confirmado" | "divergencia"
}

interface ColaboradoresClient {
  criar: {
    mutate(input: {
      empresaId: number
      nome: string
      email: string
      telefone?: string
      matricula?: string
      centroCusto?: string
    }): Promise<{ id: number }>
  }
  listar: { query(input: { empresaId: number }): Promise<Colaborador[]> }
  enviarConvite: {
    mutate(input: { id: number }): Promise<{
      linkAceite: string
      enviadoPorEmail: boolean
      email: string | null
    }>
  }
}

function useColaboradoresClient(): ColaboradoresClient {
  const utils = trpc.useUtils()
  return (utils.client as unknown as { colaboradores: ColaboradoresClient }).colaboradores
}

const STATUS_CHIP: Record<Colaborador["statusAtivacao"], { rotulo: string; cls: string }> = {
  pendente: { rotulo: "Aguardando aceitar", cls: "bg-conf-media-bg text-conf-media-text" },
  confirmado: { rotulo: "Acesso ativo", cls: "bg-brand-500/10 text-brand-500" },
  divergencia: { rotulo: "Revisar dados", cls: "bg-red-500/10 text-red-600" },
}

export default function Colaboradores() {
  const { activeCompany } = useActiveCompany()
  const empresaId = activeCompany?.id
  const colaboradores = useColaboradoresClient()
  const queryClient = useQueryClient()

  const [nome, setNome] = useState("")
  const [telefone, setTelefone] = useState("")
  const [email, setEmail] = useState("")
  const [matricula, setMatricula] = useState("")
  const [linkConvite, setLinkConvite] = useState<{ email: string | null; link: string } | null>(null)

  const lista = useQuery({
    queryKey: ["colaboradores", "listar", empresaId],
    queryFn: () => colaboradores.listar.query({ empresaId: empresaId! }),
    enabled: Boolean(empresaId),
    retry: false,
  })

  const criar = useMutation({
    mutationFn: (input: Parameters<ColaboradoresClient["criar"]["mutate"]>[0]) =>
      colaboradores.criar.mutate(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["colaboradores"] })
      setNome(""); setTelefone(""); setEmail(""); setMatricula("")
      toast.success("Colaborador cadastrado", {
        description: "Agora envie o convite — ele chega por e-mail.",
      })
    },
    onError: (erro) =>
      toast.error("Não foi possível cadastrar", { description: mensagemErro(erro, "Tente novamente.") }),
  })

  const convite = useMutation({
    mutationFn: (id: number) => colaboradores.enviarConvite.mutate({ id }),
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({ queryKey: ["colaboradores"] })
      if (res.enviadoPorEmail) {
        toast.success("Convite enviado por e-mail", { description: res.email ?? undefined })
        setLinkConvite(null)
        return
      }
      // Sem SMTP o e-mail não sai: o link fica na tela para o gestor mandar.
      setLinkConvite({ email: res.email, link: res.linkAceite })
      try {
        await navigator.clipboard.writeText(res.linkAceite)
        toast.success("Link do convite copiado", {
          description: "O e-mail automático não saiu — mande este link para o colaborador.",
        })
      } catch {
        toast.info("Copie o link do convite abaixo")
      }
    },
    onError: (erro) =>
      toast.error("Não foi possível gerar o convite", {
        description: mensagemErro(erro, "Tente novamente."),
      }),
  })

  function cadastrar(e: React.FormEvent) {
    e.preventDefault()
    if (!empresaId) return
    const fone = telefone.replace(/\D/g, "")
    if (fone && fone.length < 10) {
      toast.error("Telefone incompleto", { description: "Use DDD + número, ex.: 11 99777-6666" })
      return
    }
    criar.mutate({
      empresaId,
      nome: nome.trim(),
      email: email.trim(),
      telefone: fone ? (fone.startsWith("55") ? fone : `55${fone}`) : undefined,
      matricula: matricula.trim() || undefined,
    })
  }

  if (!empresaId) return null
  const itens = lista.data ?? []

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-lg font-semibold tracking-[-0.01em] text-text-900">
          Colaboradores
        </h2>
        <p className="text-sm text-text-500">
          Quem pede reembolso na sua empresa. Cadastre a pessoa e envie o convite — ela recebe o
          link por e-mail, escolhe uma senha e já envia as despesas.
        </p>
      </header>

      {/* Cadastro rápido */}
      <form
        onSubmit={cadastrar}
        className="grid grid-cols-1 gap-3 rounded-xl border border-line bg-surface p-5 shadow-card sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1.2fr_0.8fr_auto] lg:items-end"
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium uppercase tracking-[0.04em] text-text-500">Nome completo</span>
          <input
            required
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="João Silva"
            className="h-11 w-full rounded-[10px] border border-line bg-surface px-3.5 text-sm text-text-900 outline-none transition placeholder:text-text-500/60 focus:border-brand-500 focus:shadow-[0_0_0_3px_rgba(14,169,104,0.18)]"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium uppercase tracking-[0.04em] text-text-500">Telefone (opcional)</span>
          <input
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            placeholder="11 99777-6666"
            inputMode="tel"
            className="h-11 w-full rounded-[10px] border border-line bg-surface px-3.5 text-sm text-text-900 outline-none transition placeholder:text-text-500/60 focus:border-brand-500 focus:shadow-[0_0_0_3px_rgba(14,169,104,0.18)]"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium uppercase tracking-[0.04em] text-text-500">E-mail (o convite vai por aqui)</span>
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="joao@empresa.com.br"
            className="h-11 w-full rounded-[10px] border border-line bg-surface px-3.5 text-sm text-text-900 outline-none transition placeholder:text-text-500/60 focus:border-brand-500 focus:shadow-[0_0_0_3px_rgba(14,169,104,0.18)]"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium uppercase tracking-[0.04em] text-text-500">Matrícula</span>
          <input
            value={matricula}
            onChange={(e) => setMatricula(e.target.value)}
            placeholder="1234"
            className="h-11 w-full rounded-[10px] border border-line bg-surface px-3.5 text-sm text-text-900 outline-none transition placeholder:text-text-500/60 focus:border-brand-500 focus:shadow-[0_0_0_3px_rgba(14,169,104,0.18)]"
          />
        </label>
        <button
          type="submit"
          disabled={criar.isPending}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-[10px] bg-brand-500 px-5 text-sm font-semibold text-white transition hover:-translate-y-px hover:bg-brand-500/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <UserPlus className="h-4 w-4" />
          {criar.isPending ? "Salvando…" : "Cadastrar"}
        </button>
      </form>

      {/* Link de aceite — só aparece quando o e-mail automático não saiu */}
      {linkConvite && (
        <div className="flex flex-col gap-2 rounded-xl border border-brand-500/30 bg-brand-500/5 p-4">
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-brand-500" />
            <span className="text-[13px] font-semibold text-text-900">
              O e-mail automático não saiu — mande este link para {linkConvite.email ?? "o colaborador"}
            </span>
            <button
              type="button"
              onClick={() => setLinkConvite(null)}
              className="ml-auto text-[12px] font-semibold text-text-500 transition hover:text-text-900"
            >
              Fechar
            </button>
          </div>
          <div className="rounded-[10px] border border-line bg-surface px-3 py-2.5">
            <span className="break-all font-mono text-[12px] leading-relaxed text-text-900">
              {linkConvite.link}
            </span>
          </div>
        </div>
      )}

      {/* Lista */}
      {lista.isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-14 w-full rounded-xl" />
          <Skeleton className="h-14 w-full rounded-xl" />
        </div>
      ) : itens.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line bg-surface px-8 py-10 text-center">
          <Mail className="h-6 w-6 text-text-500/60" />
          <p className="max-w-md text-sm text-text-500">
            Nenhum colaborador ainda. Cadastre o primeiro acima — quando ele aceitar o convite que
            chega por e-mail, o status muda para “Acesso ativo” sozinho.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-card">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead>
              <tr className="border-b border-line">
                <th className="h-11 px-4 text-[12px] font-medium uppercase tracking-[0.04em] text-text-500">Nome</th>
                <th className="h-11 px-4 text-[12px] font-medium uppercase tracking-[0.04em] text-text-500">Telefone</th>
                <th className="h-11 px-4 text-[12px] font-medium uppercase tracking-[0.04em] text-text-500">Matrícula</th>
                <th className="h-11 px-4 text-[12px] font-medium uppercase tracking-[0.04em] text-text-500">Status</th>
                <th className="h-11 px-4 text-right text-[12px] font-medium uppercase tracking-[0.04em] text-text-500">Convite</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((c, i) => {
                const chip = STATUS_CHIP[c.statusAtivacao]
                return (
                  <motion.tr
                    key={c.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, ease: "easeOut", delay: 0.03 * i }}
                    className="h-14 border-b border-line last:border-b-0 hover:bg-paper"
                  >
                    <td className="px-4 text-[13px] font-medium text-text-900">{c.nome}</td>
                    <td className="px-4 font-mono text-[13px] tabular text-text-700">{c.telefone ?? "—"}</td>
                    <td className="px-4 font-mono text-[13px] tabular text-text-700">{c.matricula ?? "—"}</td>
                    <td className="px-4">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${chip.cls}`}>
                        {chip.rotulo}
                      </span>
                    </td>
                    <td className="px-4 text-right">
                      <button
                        type="button"
                        disabled={convite.isPending}
                        onClick={() => convite.mutate(c.id)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-[12px] font-semibold text-text-700 transition hover:bg-paper disabled:opacity-50"
                      >
                        {c.statusAtivacao === "pendente" ? (
                          <Send className="h-3.5 w-3.5" />
                        ) : (
                          <Link2 className="h-3.5 w-3.5" />
                        )}
                        {c.statusAtivacao === "pendente" ? "Enviar convite" : "Reenviar convite"}
                      </button>
                    </td>
                  </motion.tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

import { motion } from "framer-motion"
import { Bot, History, User } from "lucide-react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { trpc } from "@/providers/trpc"
import { Skeleton } from "@/components/ui/skeleton"

interface AuditoriaTimelineProps {
  empresaId: number | null
}

/** Trilha de auditoria imutável (RF-04): quem/motor, ação, versão da regra, data. */
export default function AuditoriaTimeline({ empresaId }: AuditoriaTimelineProps) {
  const auditoria = trpc.regras.auditoria.useQuery(
    { empresaId: empresaId ?? 0, limite: 50 },
    { enabled: empresaId !== null, retry: false },
  )

  const logs = auditoria.data ?? []

  return (
    <section className="rounded-[14px] border border-line bg-surface shadow-card">
      <div className="flex items-center gap-3 border-b border-line px-5 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-ink-900 text-brand-400">
          <History className="h-[18px] w-[18px]" />
        </span>
        <div>
          <h2 className="font-display text-[16px] font-medium tracking-[-0.01em] text-text-900">
            Trilha de auditoria
          </h2>
          <p className="text-[12px] text-text-500">
            Log imutável (RF-04): quem/motor, ação, versão da regra e data de cada evento da empresa
            ativa.
          </p>
        </div>
      </div>

      <div className="px-5 py-4">
        {empresaId === null && (
          <p className="py-6 text-center text-[13px] text-text-500">
            Selecione uma empresa para ver a trilha de auditoria.
          </p>
        )}

        {empresaId !== null && auditoria.isLoading && (
          <div className="flex flex-col gap-3 py-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="flex-1">
                  <Skeleton className="mb-1.5 h-3.5 w-2/5" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
              </div>
            ))}
          </div>
        )}

        {empresaId !== null && auditoria.isError && (
          <p className="py-6 text-center text-[13px] text-red-500">
            Não foi possível carregar a trilha de auditoria.
          </p>
        )}

        {empresaId !== null && auditoria.data && logs.length === 0 && (
          <p className="py-6 text-center text-[13px] text-text-500">
            Nenhum evento registrado ainda — classificações do motor, revisões e cadastros aparecem
            aqui com a versão da regra aplicada.
          </p>
        )}

        {logs.length > 0 && (
          <ol className="relative flex flex-col">
            {logs.map((log, i) => {
              const motor = log.usuarioId === null
              const dataFormatada = format(new Date(log.createdAt), "dd/MM/yyyy 'às' HH:mm", {
                locale: ptBR,
              })
              return (
                <motion.li
                  key={log.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.03 * i, ease: "easeOut" }}
                  className="relative flex gap-3 pb-5 last:pb-1"
                >
                  {i < logs.length - 1 && (
                    <span className="absolute left-[15px] top-9 h-[calc(100%-32px)] w-px bg-line" />
                  )}
                  <span className="z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line bg-paper text-text-500">
                    {motor ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1 pt-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-[13px] font-medium text-text-900">
                        {log.acao.replaceAll("_", " ")}
                      </span>
                      <span className="font-mono text-[11px] tabular text-text-500">
                        {log.entidade}
                        {log.entidadeId !== null && ` #${log.entidadeId}`}
                      </span>
                      <span className="rounded-full border border-line bg-paper px-1.5 font-mono text-[10px] uppercase tracking-[0.04em] text-text-500">
                        {motor ? "motor" : "usuário"}
                      </span>
                      {log.regraVersao && (
                        <span className="rounded-full bg-brand-500/10 px-1.5 font-mono text-[10px] uppercase tracking-[0.04em] text-brand-500">
                          regra v{log.regraVersao}
                        </span>
                      )}
                    </div>
                    {log.detalhes && (
                      <p className="line-clamp-2 text-[12px] leading-relaxed text-text-500">
                        {log.detalhes}
                      </p>
                    )}
                    <span className="font-mono text-[11px] tabular tracking-[0.02em] text-text-500">
                      {dataFormatada}
                    </span>
                  </div>
                </motion.li>
              )
            })}
          </ol>
        )}
      </div>
    </section>
  )
}

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  CircleCheck,
  CircleX,
  ScanSearch,
  UserSearch,
  XCircle,
} from "lucide-react"
import {
  DECISAO_POLITICA_LABELS,
  type DecisaoPolitica,
  type RegraAplicada,
} from "@contracts/types"
import { cn } from "@/lib/utils"
import { detalheLegivel, rotuloRegraAplicada } from "./veredito"

interface VereditoPoliticaProps {
  decisao: DecisaoPolitica
  motivos: string[]
  regrasAplicadas?: RegraAplicada[]
  /** Versão da política aplicada; exibida como chip `política v{N}` quando presente */
  versao?: number | null
  className?: string
}

const DECISAO_STYLE: Record<
  DecisaoPolitica,
  { icon: typeof CheckCircle2; badge: string; border: string }
> = {
  aprovado: {
    icon: CheckCircle2,
    badge: "border-[#B9DEC5] bg-[#EAF5EE] text-[#166B31]",
    border: "border-[#B9DEC5]",
  },
  negado: {
    icon: XCircle,
    badge: "border-[#EDB9B3] bg-[#FBEAE8] text-[#9A2B22]",
    border: "border-[#EDB9B3]",
  },
  revisao_humana: {
    icon: UserSearch,
    badge: "border-[#EBD2A2] bg-[#FBF3E4] text-[#8A5A0E]",
    border: "border-[#EBD2A2]",
  },
}

const RESULTADO_STYLE: Record<
  RegraAplicada["resultado"],
  { icon: typeof CircleCheck; tone: string; label: string }
> = {
  passou: { icon: CircleCheck, tone: "text-[#166B31]", label: "passou" },
  falhou: { icon: CircleX, tone: "text-[#9A2B22]", label: "falhou" },
  revisar: { icon: ScanSearch, tone: "text-[#8A5A0E]", label: "revisar" },
}

/**
 * Veredito do agente de política de reembolso: superfície clara e semáforo
 * reservados aos resultados, conforme os tokens do painel fornecido.
 * Mostra a decisão (aprovado / negado / revisão humana), os motivos em PT-BR
 * e, quando disponível, a trilha de regras avaliadas (colapsável).
 */
export default function VereditoPolitica({
  decisao,
  motivos,
  regrasAplicadas,
  versao,
  className,
}: VereditoPoliticaProps) {
  const [regrasAbertas, setRegrasAbertas] = useState(false)
  const estilo = DECISAO_STYLE[decisao]
  const IconeDecisao = estilo.icon

  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-xl border bg-surface p-5 shadow-card",
        estilo.border,
        className,
      )}
    >
      {/* Cabeçalho: agente + decisão */}
      <div className="flex flex-wrap items-center gap-2.5">
        <Bot className="h-4 w-4 text-text-500" />
        <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-500">
          Agente de política
        </span>
        <span className="flex-1" />
        {versao != null && (
          <span className="inline-flex h-5 items-center rounded-md border border-line bg-paper px-1.5 font-mono text-[10px] font-semibold tabular text-text-500">
            política v{versao}
          </span>
        )}
        <span
          className={cn(
            "inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.04em]",
            estilo.badge,
          )}
        >
          <IconeDecisao className="h-3.5 w-3.5" />
          {DECISAO_POLITICA_LABELS[decisao]}
        </span>
      </div>

      {/* Motivos */}
      {motivos.length > 0 && (
        <>
          <div className="border-t border-dashed border-line" />
          <ul className="flex flex-col gap-1.5">
            {motivos.map((motivo, i) => (
              <motion.li
                key={i}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: 0.05 + i * 0.05, ease: "easeOut" }}
                className="flex items-start gap-2 font-mono text-[12px] leading-relaxed text-text-900"
              >
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-text-500" />
                {motivo}
              </motion.li>
            ))}
          </ul>
        </>
      )}

      {/* Trilha de regras avaliadas (colapsável) */}
      {regrasAplicadas && regrasAplicadas.length > 0 && (
        <>
          <div className="border-t border-dashed border-line" />
          <button
            type="button"
            onClick={() => setRegrasAbertas((aberto) => !aberto)}
            className="flex items-center gap-2 text-left transition hover:opacity-80"
          >
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 text-text-500 transition-transform duration-200",
                regrasAbertas && "rotate-180",
              )}
            />
            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-text-500">
              Regras avaliadas · {regrasAplicadas.length}
            </span>
          </button>
          <AnimatePresence initial={false}>
            {regrasAbertas && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="overflow-hidden"
              >
                <ul className="flex flex-col gap-2 rounded-lg border border-line bg-paper p-3">
                  {regrasAplicadas.map((regra, i) => {
                    const estiloRegra = RESULTADO_STYLE[regra.resultado]
                    const IconeRegra = estiloRegra.icon
                    return (
                      <li key={i} className="flex items-start gap-2.5">
                        <IconeRegra
                          className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", estiloRegra.tone)}
                        />
                        <div className="flex flex-col gap-0.5">
                          <span className="font-mono text-[12px] font-semibold leading-snug text-text-900">
                            {rotuloRegraAplicada(regra.regra)}
                            <span
                              className={cn(
                                "ml-2 text-[10px] uppercase tracking-[0.04em]",
                                estiloRegra.tone,
                              )}
                            >
                              {estiloRegra.label}
                            </span>
                          </span>
                          <span className="font-mono text-[11px] leading-relaxed text-text-500">
                            {detalheLegivel(regra.detalhe)}
                          </span>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  )
}

import { motion } from "framer-motion"
import {
  CircleCheck,
  CircleX,
  ClipboardCheck,
  LayoutDashboard,
  Receipt,
  RotateCcw,
} from "lucide-react"
import { Link } from "react-router"
import type { CategoriaDespesa, RegraAplicada } from "@contracts/types"
import { cn } from "@/lib/utils"
import { formatBRL } from "@/lib/format"
import { CATEGORIA_META, formatData } from "../meta"

export interface Veredito {
  despesaId: number
  decisao: "aprovado" | "negado" | "revisao_manual"
  motivos: string[]
  regrasAplicadas: RegraAplicada[]
  politicaVersao: number | null
  categoria: CategoriaDespesa | null
  valor: number | null
  dataFatoGerador: string | null
  cnpjEmitente: string | null
}

interface StepVereditoProps {
  veredito: Veredito
  onReiniciar: () => void
}

const VISUAL = {
  aprovado: {
    icone: CircleCheck,
    titulo: "Aprovado",
    texto: "Dentro da política de reembolso.",
    corIcone: "text-conf-alta-text",
    corFundo: "bg-conf-alta-bg",
    corTitulo: "text-conf-alta-text",
  },
  negado: {
    icone: CircleX,
    titulo: "Negado",
    texto: "Fora da política de reembolso.",
    corIcone: "text-conf-vedado-text",
    corFundo: "bg-conf-vedado-bg",
    corTitulo: "text-conf-vedado-text",
  },
  revisao_manual: {
    icone: ClipboardCheck,
    titulo: "Revisão manual",
    texto: "O gestor decide olhando a evidência — ninguém preenche nada.",
    corIcone: "text-conf-media-text",
    corFundo: "bg-conf-media-bg",
    corTitulo: "text-conf-media-text",
  },
} as const

/**
 * Veredito do fluxo automático (v1.7.0 — D-013/D-014):
 * foto entra → extrai → aprova / nega / revisão manual. Sem "conferir dados".
 */
export default function StepVeredito({ veredito, onReiniciar }: StepVereditoProps) {
  const v = VISUAL[veredito.decisao]
  const Icone = v.icone
  const categoriaLabel = veredito.categoria
    ? (CATEGORIA_META[veredito.categoria]?.label ?? veredito.categoria)
    : "não identificada"

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-5">
      {/* Veredito */}
      <div className="flex flex-col items-center gap-3 text-center">
        <motion.span
          initial={{ scale: 0.6 }}
          animate={{ scale: [0.6, 1.08, 1] }}
          transition={{ type: "spring", stiffness: 260, damping: 18 }}
          className={cn("flex h-16 w-16 items-center justify-center rounded-full", v.corFundo)}
        >
          <Icone className={cn("h-8 w-8", v.corIcone)} />
        </motion.span>
        <h2 className={cn("font-display text-2xl font-semibold tracking-[-0.01em]", v.corTitulo)}>
          {v.titulo}
        </h2>
        <p className="max-w-md text-sm text-text-500">{v.texto}</p>
      </div>

      {/* O que a extração viu (somente leitura — ninguém preenche nada) */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.08 }}
        className="grid grid-cols-2 gap-3 rounded-xl border border-line bg-surface p-4 shadow-card sm:grid-cols-4"
      >
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.04em] text-text-500">Valor</span>
          <span className="font-mono text-[14px] font-semibold tabular text-text-900">
            {veredito.valor != null ? formatBRL(veredito.valor) : "—"}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.04em] text-text-500">Data</span>
          <span className="font-mono text-[14px] tabular text-text-900">
            {veredito.dataFatoGerador ? formatData(veredito.dataFatoGerador) : "—"}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.04em] text-text-500">Categoria</span>
          <span className="text-[13px] font-medium text-text-900">{categoriaLabel}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.04em] text-text-500">CNPJ emitente</span>
          <span className="font-mono text-[12px] tabular text-text-900">
            {veredito.cnpjEmitente ?? "—"}
          </span>
        </div>
      </motion.div>

      {/* Regras citadas */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.15 }}
        className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4 shadow-card"
      >
        <span className="font-mono text-[10px] uppercase tracking-[0.04em] text-text-500">
          Fundamentação{veredito.politicaVersao != null ? ` · política v${veredito.politicaVersao}` : ""}
        </span>
        {veredito.motivos.map((m, i) => (
          <p key={i} className="text-[13px] leading-relaxed text-text-900">{m}</p>
        ))}
        {veredito.regrasAplicadas.length > 0 && (
          <ul className="mt-1 flex flex-col gap-1 border-t border-line pt-2">
            {veredito.regrasAplicadas.map((r, i) => (
              <li key={i} className="font-mono text-[11px] leading-relaxed text-text-500">
                {r.regra}: {r.detalhe ?? r.resultado}
              </li>
            ))}
          </ul>
        )}
      </motion.div>

      {/* Ações */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.25 }}
        className="flex flex-wrap items-center justify-center gap-2"
      >
        <Link
          to={`/app/despesas?despesa=${veredito.despesaId}`}
          className="inline-flex h-11 items-center gap-2 rounded-[10px] bg-brand-500 px-5 text-[13px] font-semibold text-white transition hover:-translate-y-px hover:bg-brand-500/90"
        >
          <Receipt className="h-4 w-4" />
          Ver despesa
        </Link>
        <button
          type="button"
          onClick={onReiniciar}
          className="inline-flex h-11 items-center gap-2 rounded-[10px] border border-line bg-surface px-5 text-[13px] font-semibold text-text-900 transition hover:bg-paper"
        >
          <RotateCcw className="h-4 w-4 text-text-500" />
          Enviar outra nota
        </button>
        <Link
          to="/app/dashboard"
          className="inline-flex h-11 items-center gap-2 rounded-[10px] px-4 text-[13px] font-semibold text-text-500 transition hover:bg-paper hover:text-text-900"
        >
          <LayoutDashboard className="h-4 w-4" />
          Ir ao dashboard
        </Link>
      </motion.div>
    </div>
  )
}

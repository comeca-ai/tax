import { Link } from "react-router"
import { motion } from "framer-motion"
import { ArrowRight, TriangleAlert } from "lucide-react"
import type { CategoriaDespesa } from "@contracts/types"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import ConfidenceBadge from "@/components/app/ConfidenceBadge"
import RuleChip from "@/components/app/RuleChip"
import {
  CATEGORIA_ROTULO,
  DATA_CORTE_MP_1340,
  TIPO_BENEFICIO_ROTULO,
  TRIBUTO_ROTULO,
  formatVigencia,
} from "./labels"
import type { RegraRow } from "./labels"

export interface CelulaSelecionada {
  titulo: string
  categoria: CategoriaDespesa | null
  dedutibilidade: boolean
  regraPrincipal: RegraRow
  regrasRelacionadas: RegraRow[]
  mediaAlta: boolean
}

interface RegraDetalheModalProps {
  selecao: CelulaSelecionada | null
  onClose: () => void
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-text-500">
        {rotulo}
      </span>
      {children}
    </div>
  )
}

/** Modal de detalhe da regra: base legal, vigência, versão, tipo de benefício. */
export default function RegraDetalheModal({ selecao, onClose }: RegraDetalheModalProps) {
  const regra = selecao?.regraPrincipal ?? null

  const tributos = selecao
    ? [...new Set(selecao.regrasRelacionadas.map((r) => r.tributo))]
    : []
  const basesLegais = selecao
    ? [...new Set(selecao.regrasRelacionadas.map((r) => r.baseLegal).filter((b): b is string => !!b))]
    : []

  const observacoes: string[] = []
  if (regra) {
    if (regra.confianca === "media") {
      observacoes.push(
        selecao?.mediaAlta
          ? "Confiança Média-Alta: exige documento de suporte (RF-04) e validação de advogado tributarista."
          : "Média confiança exige documento de suporte (RF-04) e validação de advogado tributarista.",
      )
    }
    if (regra.confianca === "vedado") {
      observacoes.push("Crédito vedado para este CNAE × categoria — não classificar como elegível.")
    }
    if (
      selecao?.categoria === "combustivel" &&
      selecao.regrasRelacionadas.some((r) => r.tributo === "pis_cofins")
    ) {
      observacoes.push(
        "PIS/COFINS diesel/GLP zerado a partir de 11/03/2026 (MP 1.340/2026). Fator 90% (LC 224/2025): a confirmar.",
      )
    }
    if (selecao?.dedutibilidade) {
      observacoes.push(
        "Regra única: qualquer CNAE. IRPJ 25% + CSLL 9% sobre a base dedutível (despesa − crédito CBS − crédito IBS).",
      )
    }
  }

  const linkDespesas = selecao?.categoria
    ? `/app/despesas?categoria=${selecao.categoria}&confianca=${regra?.confianca ?? "alta"}`
    : "/app/despesas?tributo=irpj_csll"

  return (
    <Dialog open={selecao !== null} onOpenChange={(aberto) => !aberto && onClose()}>
      <DialogContent className="max-w-[560px] border-line bg-surface p-0">
        {selecao && regra && (
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
          >
            <DialogHeader className="border-b border-line px-6 pb-4 pt-6">
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle className="font-display text-[18px] font-medium tracking-[-0.01em] text-text-900">
                  {selecao.titulo}
                </DialogTitle>
                <ConfidenceBadge level={regra.confianca} variant="solid" />
                {selecao.mediaAlta && regra.confianca === "media" && (
                  <span className="rounded-full bg-conf-media-bg px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.04em] text-conf-media-text">
                    Média+
                  </span>
                )}
              </div>
              <DialogDescription className="sr-only">
                Detalhe da regra de elegibilidade: tributos, base legal, vigência e versão.
              </DialogDescription>
              <span className="mt-1 inline-flex w-fit items-center rounded-md border border-line bg-paper px-2 py-0.5 font-mono text-[11px] tracking-[0.02em] text-text-500">
                tipo: {TIPO_BENEFICIO_ROTULO[regra.tipoBeneficio]}
              </span>
            </DialogHeader>

            <div className="flex flex-col gap-5 px-6 py-5">
              <Campo rotulo="Tributo(s) afetados">
                <div className="flex flex-wrap gap-1.5">
                  {tributos.map((t) => (
                    <span
                      key={t}
                      className="inline-flex h-6 items-center rounded-full bg-brand-500/10 px-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.04em] text-brand-500"
                    >
                      {TRIBUTO_ROTULO[t]}
                    </span>
                  ))}
                </div>
              </Campo>

              <Campo rotulo="Base legal">
                <div className="flex flex-wrap gap-1.5">
                  {basesLegais.map((base, i) => (
                    <motion.span
                      key={base}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.05 * i, duration: 0.2 }}
                    >
                      <RuleChip label={base} />
                    </motion.span>
                  ))}
                  {basesLegais.length === 0 && (
                    <span className="text-[13px] text-text-500">Base legal não informada.</span>
                  )}
                </div>
              </Campo>

              <div className="grid grid-cols-2 gap-4">
                <Campo rotulo="Vigência">
                  <span className="font-mono text-[13px] tabular text-text-900">
                    {formatVigencia(regra.vigenciaInicio, regra.vigenciaFim)}
                  </span>
                </Campo>
                <Campo rotulo="Versão">
                  <span className="font-mono text-[13px] tabular text-text-900">
                    v{regra.versao}
                  </span>
                </Campo>
              </div>

              {regra.aliquota !== null && (
                <Campo rotulo="Alíquota / fator">
                  <span className="font-mono text-[13px] tabular text-text-900">
                    {(regra.aliquota * 100).toLocaleString("pt-BR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                    %
                  </span>
                </Campo>
              )}

              {observacoes.length > 0 && (
                <Campo rotulo="Observações">
                  <div className="flex flex-col gap-2">
                    {observacoes.map((obs) => (
                      <p
                        key={obs}
                        className="flex items-start gap-2 rounded-lg border border-conf-media-dot/20 bg-conf-media-bg px-3 py-2 text-[12px] leading-relaxed text-conf-media-text"
                      >
                        <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        {obs}
                      </p>
                    ))}
                  </div>
                </Campo>
              )}

              <p className="font-mono text-[11px] tracking-[0.02em] text-text-500">
                regra v{regra.versao} · vigente desde{" "}
                {new Date(`${regra.vigenciaInicio}T00:00:00`).toLocaleDateString("pt-BR")}
                {selecao.categoria === "combustivel" &&
                  ` · corte MP 1.340/2026 em ${new Date(`${DATA_CORTE_MP_1340}T00:00:00`).toLocaleDateString("pt-BR")}`}
                {selecao.categoria && ` · categoria ${CATEGORIA_ROTULO[selecao.categoria].toLowerCase()}`}
              </p>
            </div>

            <div className="flex items-center justify-between border-t border-line px-6 py-4">
              <Link
                to={linkDespesas}
                className="inline-flex h-9 items-center gap-1.5 rounded-[10px] px-3 text-[13px] font-medium text-brand-500 transition-colors hover:bg-brand-500/10"
              >
                Ver despesas com esta regra
                <ArrowRight className="h-4 w-4" />
              </Link>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-9 items-center rounded-[10px] border border-line px-4 text-[13px] font-medium text-text-900 transition-colors hover:bg-paper"
              >
                Fechar
              </button>
            </div>
          </motion.div>
        )}
      </DialogContent>
    </Dialog>
  )
}

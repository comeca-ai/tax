import { motion } from "framer-motion"
import {
  CircleAlert,
  Gauge,
  LayoutDashboard,
  Paperclip,
  Receipt,
  RotateCcw,
} from "lucide-react"
import { Link } from "react-router"
import type {
  CategoriaDespesa,
  NivelConfianca,
  ResultadoMotor,
  ResultadoPolitica,
} from "@contracts/types"
import ConfidenceBadge from "@/components/app/ConfidenceBadge"
import VereditoPolitica from "@/components/politica/VereditoPolitica"
import { cn } from "@/lib/utils"
import { CATEGORIA_META, formatNumero } from "../meta"
import MemorialCard from "../MemorialCard"

interface StepResultadoProps {
  despesaId: number
  resultado: ResultadoMotor
  /** Veredito do Agente de Política (v1.1.0) — null quando não há política ativa. */
  politica: (ResultadoPolitica & { versao: number | null }) | null
  categoria: CategoriaDespesa | ""
  cnaeEmpresa: string
  regimeEmpresa: string
  restantes: number
  onProximaNota: () => void
  onReiniciar: () => void
}

const VEREDITOS: Record<
  NivelConfianca,
  { titulo: string; texto: string | null; cor: string }
> = {
  alta: {
    titulo: "Alta confiança — liberada automaticamente",
    texto: null,
    cor: "text-conf-alta-text",
  },
  media: {
    titulo: "Média confiança — enviada para revisão",
    texto: "Anexe o documento de suporte para acelerar a validação humana.",
    cor: "text-conf-media-text",
  },
  baixa: {
    titulo: "Baixa confiança — revisão necessária",
    texto: "Os campos extraídos precisam de conferência humana antes da liberação.",
    cor: "text-conf-baixa-text",
  },
  vedado: {
    titulo: "Vedado — sem crédito nesta combinação",
    texto:
      "Esta combinação CNAE × categoria não gera crédito. A dedutibilidade IRPJ/CSLL ainda foi apurada.",
    cor: "text-conf-vedado-text",
  },
}

export default function StepResultado({
  despesaId,
  resultado,
  politica,
  categoria,
  cnaeEmpresa,
  regimeEmpresa,
  restantes,
  onProximaNota,
  onReiniciar,
}: StepResultadoProps) {
  const veredito = VEREDITOS[resultado.confianca]
  const plaus = resultado.plausibilidade
  const rf09Disparado = plaus.aprovado === false && plaus.divergenciaPct !== null
  const categoriaLabel = categoria ? (CATEGORIA_META[categoria]?.label ?? categoria) : "—"
  const regraVersao = resultado.memorialTributos[0]?.regraVersao ?? "1.1"

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-5">
      {/* Veredito */}
      <div className="flex flex-col items-center gap-3 text-center">
        <motion.div
          initial={{ scale: 0.6 }}
          animate={{ scale: [0.6, 1.08, 1] }}
          transition={{ type: "spring", stiffness: 260, damping: 18 }}
        >
          <ConfidenceBadge level={resultado.confianca} variant="solid" className="h-8 px-4 text-[13px]" />
        </motion.div>
        <h2 className={`font-display text-2xl font-semibold tracking-[-0.01em] ${veredito.cor}`}>
          {veredito.titulo}
        </h2>
        {veredito.texto && (
          <p className="max-w-md text-sm text-text-500">{veredito.texto}</p>
        )}
        {resultado.requerEvidencia && (
          <Link
            to={`/app/despesas?despesa=${despesaId}`}
            className="inline-flex h-9 items-center gap-2 rounded-[10px] bg-conf-media-text px-4 text-[13px] font-semibold text-white transition hover:opacity-90"
          >
            <Paperclip className="h-4 w-4" />
            Anexar agora
          </Link>
        )}
      </div>

      {/* Agente de política (v1.1.0) — veredito logo abaixo do veredito tributário */}
      {politica && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.08 }}
          className="flex flex-col gap-2"
        >
          <VereditoPolitica
            decisao={politica.decisao}
            motivos={politica.motivos}
            regrasAplicadas={politica.regrasAplicadas}
            versao={politica.versao}
          />
          {politica.decisao !== "aprovado" && (
            <p
              className={cn(
                "text-center text-[13px] font-semibold",
                politica.decisao === "negado" ? "text-conf-vedado-text" : "text-conf-media-text",
              )}
            >
              {politica.decisao === "negado"
                ? "Despesa negada pela política"
                : "Enviada para revisão humana pela política"}
            </p>
          )}
        </motion.div>
      )}

      {/* Raciocínio da classificação */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4 shadow-card"
      >
        <span className="font-mono text-[12px] leading-relaxed text-text-900">
          CNAE {cnaeEmpresa} × {categoriaLabel} × {regimeEmpresa} →{" "}
          <span className="font-semibold">{resultado.confianca} confiança</span>
        </span>
        <span className="inline-flex w-fit items-center rounded-md border border-line bg-paper px-2 py-1 font-mono text-[11px] tracking-[0.02em] text-text-500">
          regra v{regraVersao} · vigente na data do fato
        </span>
        {resultado.percentualComercial !== null && (
          <span className="font-mono text-[12px] text-text-500">
            uso comercial {resultado.percentualComercial}% · valor fiscal{" "}
            {resultado.valorFiscal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} ·
            valor reembolsável{" "}
            {resultado.valorReembolsavel.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          </span>
        )}
      </motion.div>

      {/* RF-09 — divergência de consumo */}
      {rf09Disparado && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.15 }}
          className="flex items-start gap-3 rounded-xl border border-conf-media-dot/25 bg-conf-media-bg p-4"
        >
          <Gauge className="mt-0.5 h-5 w-5 shrink-0 text-conf-media-text" />
          <div className="flex flex-col gap-1">
            <span className="text-[13px] font-semibold text-conf-media-text">
              Divergência de consumo (RF-09)
            </span>
            <span className="font-mono text-[12px] leading-relaxed text-conf-media-text">
              Consumo real {formatNumero(plaus.consumoRealKmPorLitro)} km/L vs declarado{" "}
              {formatNumero(plaus.kmPorLitroDeclarado)} km/L — divergência de{" "}
              {formatNumero(plaus.divergenciaPct)}% (&gt; tolerância 15%). Confiança rebaixada →
              revisão.
            </span>
          </div>
        </motion.div>
      )}

      {/* Alertas do motor */}
      {resultado.alertas.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="flex flex-col gap-1.5 rounded-xl border border-line bg-surface p-4 shadow-card"
        >
          {resultado.alertas.map((alerta, i) => (
            <span key={i} className="flex items-start gap-2 font-mono text-[12px] leading-relaxed text-text-500">
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-conf-media-dot" />
              {alerta}
            </span>
          ))}
        </motion.div>
      )}

      {/* Memorial de quantificação */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.25 }}
      >
        <MemorialCard
          linhas={resultado.memorialTributos}
          contexto={`regra v${regraVersao} · status sugerido: ${resultado.statusSugerido.replace("_", " ")}`}
        />
      </motion.div>

      {/* Ações */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.35 }}
        className="flex flex-wrap items-center justify-center gap-2"
      >
        <Link
          to={`/app/despesas?despesa=${despesaId}`}
          className="inline-flex h-11 items-center gap-2 rounded-[10px] bg-brand-500 px-5 text-[13px] font-semibold text-white transition hover:-translate-y-px hover:bg-brand-500/90"
        >
          <Receipt className="h-4 w-4" />
          Ver despesa
        </Link>
        {restantes > 0 ? (
          <button
            type="button"
            onClick={onProximaNota}
            className="inline-flex h-11 items-center gap-2 rounded-[10px] border border-line bg-surface px-5 text-[13px] font-semibold text-text-900 transition hover:bg-paper"
          >
            Revisar próxima nota ({restantes} restante{restantes > 1 ? "s" : ""})
          </button>
        ) : (
          <button
            type="button"
            onClick={onReiniciar}
            className="inline-flex h-11 items-center gap-2 rounded-[10px] border border-line bg-surface px-5 text-[13px] font-semibold text-text-900 transition hover:bg-paper"
          >
            <RotateCcw className="h-4 w-4 text-text-500" />
            Enviar outra nota
          </button>
        )}
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

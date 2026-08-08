import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { FlaskConical, Info, LoaderCircle } from "lucide-react"
import { toast } from "sonner"
import { trpc } from "@/providers/trpc"
import type { CategoriaDespesa } from "@contracts/types"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { CATEGORIA_OPTIONS } from "@/components/despesas/meta"
import { numeroParaPt, parseNumeroPt } from "@/components/despesas/wizard/types"
import { cn } from "@/lib/utils"
import VereditoPolitica from "./VereditoPolitica"

type TestarSaida = {
  politicaAtiva: boolean
  versao: number | null
  resultado: {
    decisao: "aprovado" | "negado" | "revisao_humana"
    motivos: string[]
    regrasAplicadas: {
      regra: string
      resultado: "passou" | "falhou" | "revisar"
      detalhe: string
    }[]
  } | null
}

interface SimuladorPoliticaProps {
  empresaId: number
  /** Contexto exibido acima do veredito (ex.: wizard — simulação usa a política ativa atual). */
  nota?: string
  className?: string
}

const INPUT_BASE =
  "h-11 w-full rounded-[10px] border border-line bg-surface px-3 font-mono text-[13px] tabular text-text-900 outline-none transition placeholder:text-text-500/60 focus:border-brand-500 focus:ring-[3px] focus:ring-brand-500/20"

/**
 * Playground do agente (dry-run via `politica.testar`): categoria + valor +
 * toggles de veículo/evidência → veredito ao vivo contra a política ATIVA.
 * Não grava nada.
 */
export default function SimuladorPolitica({ empresaId, nota, className }: SimuladorPoliticaProps) {
  const [categoria, setCategoria] = useState<CategoriaDespesa>("combustivel")
  const [valor, setValor] = useState("250,00")
  const [temVeiculo, setTemVeiculo] = useState(false)
  const [temEvidencia, setTemEvidencia] = useState(false)
  const [saida, setSaida] = useState<TestarSaida | null>(null)

  const testar = trpc.politica.testar.useMutation({
    onError: (erro) => {
      toast.error("Falha ao simular o agente", { description: erro.message })
    },
  })
  const testarRef = useRef(testar)
  useEffect(() => {
    testarRef.current = testar
  }, [testar])

  // Simula ao montar e a cada mudança (debounce para não martelar o servidor)
  useEffect(() => {
    if (empresaId <= 0) return
    const timer = window.setTimeout(() => {
      testarRef.current
        .mutateAsync({
          empresaId,
          categoria,
          valorNota: parseNumeroPt(valor || "0"),
          temVeiculo,
          temEvidencia,
        })
        .then((res) => setSaida(res as TestarSaida))
        .catch(() => {})
    }, 350)
    return () => window.clearTimeout(timer)
  }, [empresaId, categoria, valor, temVeiculo, temEvidencia])

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="flex items-center gap-2">
        <FlaskConical className="h-4 w-4 text-brand-500" />
        <h3 className="font-display text-[15px] font-semibold tracking-[-0.01em] text-text-900">
          Simular o agente
        </h3>
        {testar.isPending && (
          <LoaderCircle className="h-3.5 w-3.5 animate-spin text-text-500" aria-label="Simulando" />
        )}
      </div>

      {/* Controles */}
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-text-500">
            Categoria
          </span>
          <Select value={categoria} onValueChange={(v) => setCategoria(v as CategoriaDespesa)}>
            <SelectTrigger className="h-11 rounded-[10px] border-line text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIA_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-text-500">
            Valor da nota (R$)
          </span>
          <input
            inputMode="decimal"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            onBlur={() => {
              const n = parseNumeroPt(valor || "0")
              setValor(n > 0 ? numeroParaPt(n) : "")
            }}
            placeholder="0,00"
            className={INPUT_BASE}
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-3">
        <label className="flex cursor-pointer items-center gap-2.5">
          <Switch checked={temVeiculo} onCheckedChange={setTemVeiculo} />
          <span className="text-[13px] font-medium text-text-900">Veículo cadastrado vinculado</span>
        </label>
        <label className="flex cursor-pointer items-center gap-2.5">
          <Switch checked={temEvidencia} onCheckedChange={setTemEvidencia} />
          <span className="text-[13px] font-medium text-text-900">Evidência documental anexada</span>
        </label>
      </div>

      {/* Resultado ao vivo */}
      <AnimatePresence mode="wait">
        {saida?.resultado ? (
          <motion.div
            key="veredito"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            {nota && (
              <p className="mb-2 flex items-start gap-1.5 font-mono text-[11px] leading-relaxed tracking-[0.02em] text-text-500">
                <Info className="mt-0.5 h-3 w-3 shrink-0" />
                {nota}
              </p>
            )}
            <VereditoPolitica
              decisao={saida.resultado.decisao}
              motivos={saida.resultado.motivos}
              regrasAplicadas={saida.resultado.regrasAplicadas}
              versao={saida.versao}
            />
          </motion.div>
        ) : saida && !saida.politicaAtiva ? (
          <motion.div
            key="sem-ativa"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="flex items-start gap-2.5 rounded-xl border border-dashed border-line bg-paper px-4 py-4"
          >
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-text-500" />
            <p className="text-[13px] leading-relaxed text-text-500">
              Nenhuma política ativa no momento — a simulação ao vivo fica disponível assim que uma
              versão for ativada.
            </p>
          </motion.div>
        ) : (
          <motion.div
            key="aguardando"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex h-24 items-center justify-center rounded-xl border border-dashed border-line bg-paper"
          >
            <span className="font-mono text-[11px] tracking-[0.02em] text-text-500">
              Ajuste os parâmetros para ver o veredito do agente.
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

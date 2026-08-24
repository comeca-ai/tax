import { useMemo, useState } from "react"
import { Link } from "react-router"
import { motion } from "framer-motion"
import {
  ArrowRight,
  Building2,
  Check,
  Receipt,
  ScrollText,
  X,
  type LucideIcon,
} from "lucide-react"
import { trpc } from "@/providers/trpc"
import { useAuth } from "@/hooks/useAuth"
import { useActiveCompany } from "@/hooks/useActiveCompany"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

function chaveDismiss(usuarioId: number): string {
  return `onboarding-dismissed:${usuarioId}`
}

interface Passo {
  rotulo: string
  descricao: string
  to: string
  icone: LucideIcon
  completo: boolean
}

/**
 * Checklist de onboarding — 3 passos computados de dados reais.
 * Some quando os 3 estão completos ou quando o usuário fecha (persistido por usuário).
 *
 * O cadastro de veículo saiu do checklist: ele não é pré-requisito para enviar
 * despesa, e o motor de política não exige veículo cadastrado. Continua
 * disponível em Configurar → Veículos, para quem usa reembolso de quilometragem.
 */
export default function OnboardingChecklist() {
  const { user } = useAuth()
  const { activeCompany, companies, isLoading: carregandoEmpresas } = useActiveCompany()
  const empresaId = activeCompany?.id ?? 0

  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (!user) return false
    try {
      return window.localStorage.getItem(chaveDismiss(user.id)) === "1"
    } catch {
      return false
    }
  })

  const politicaQ = trpc.politica.ativa.useQuery(
    { empresaId },
    { enabled: empresaId > 0, retry: false },
  )
  const despesasQ = trpc.despesas.list.useQuery(
    { empresaId },
    { enabled: empresaId > 0, retry: false },
  )

  const passos: Passo[] = useMemo(
    () => [
      {
        rotulo: "Cadastre sua empresa",
        descricao: "CNAE, regime tributário e UF liberam o motor de créditos",
        to: "/app/empresas",
        icone: Building2,
        completo: companies.length > 0,
      },
      {
        rotulo: "Ative a política de reembolso",
        descricao: "O agente de política avalia cada despesa automaticamente",
        to: "/app/politica",
        icone: ScrollText,
        completo: politicaQ.data != null,
      },
      {
        rotulo: "Envie sua primeira despesa",
        descricao: "Foto da nota → OCR → veredito do motor em segundos",
        to: "/app/rapido",
        icone: Receipt,
        completo: (despesasQ.data?.length ?? 0) > 0,
      },
    ],
    [companies.length, politicaQ.data, despesasQ.data],
  )

  const completos = passos.filter((p) => p.completo).length

  if (!user || dismissed || carregandoEmpresas) return null
  // Só decide "tudo completo" quando as queries da empresa ativa já responderam.
  if (empresaId > 0 && (politicaQ.isLoading || despesasQ.isLoading)) {
    return null
  }
  if (completos === passos.length) return null

  function fechar() {
    setDismissed(true)
    if (user) {
      try {
        window.localStorage.setItem(chaveDismiss(user.id), "1")
      } catch {
        // localStorage indisponível — dismiss vale só para esta sessão.
      }
    }
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      aria-label="Checklist de primeiros passos"
      className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5 shadow-card"
    >
      <div className="flex items-start gap-3">
        <div className="flex flex-1 flex-col gap-1">
          <h2 className="font-display text-lg font-medium tracking-[-0.01em] text-text-900">
            Primeiros passos
          </h2>
          <p className="text-[13px] text-text-500">
            Configure a plataforma em 3 passos para começar a recuperar tributos.
          </p>
        </div>
        <span className="font-mono text-[12px] font-semibold tabular text-text-500">
          {completos}/{passos.length}
        </span>
        <button
          type="button"
          onClick={fechar}
          aria-label="Fechar checklist de onboarding"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-text-500 transition hover:bg-paper hover:text-text-900"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <Progress
        value={(completos / passos.length) * 100}
        className="h-1.5 bg-paper [&_[data-slot=progress-indicator]]:bg-brand-500"
      />

      <ol className="grid gap-2 sm:grid-cols-2">
        {passos.map((passo, i) => {
          const Icone = passo.icone
          return (
            <motion.li
              key={passo.rotulo}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.25, ease: "easeOut", delay: 0.05 * i }}
            >
              {passo.completo ? (
                <div className="flex items-center gap-3 rounded-[10px] border border-line bg-paper/60 px-3.5 py-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-conf-alta-dot text-white">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                  <span className="text-[13px] font-medium text-text-500 line-through decoration-text-500/50">
                    {passo.rotulo}
                  </span>
                </div>
              ) : (
                <Link
                  to={passo.to}
                  className={cn(
                    "group flex items-center gap-3 rounded-[10px] border border-line bg-surface px-3.5 py-3 transition",
                    "hover:-translate-y-px hover:border-brand-500/40 hover:shadow-card",
                  )}
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-500/10 text-brand-500">
                    <Icone className="h-3.5 w-3.5" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[13px] font-semibold text-text-900">{passo.rotulo}</span>
                    <span className="truncate text-[12px] text-text-500">{passo.descricao}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-text-500 transition group-hover:translate-x-0.5 group-hover:text-brand-500" />
                </Link>
              )}
            </motion.li>
          )
        })}
      </ol>
    </motion.section>
  )
}

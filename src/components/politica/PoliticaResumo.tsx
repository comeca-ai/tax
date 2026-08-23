import {
  CarFront,
  CircleCheck,
  CircleX,
  Paperclip,
  ScanSearch,
  StickyNote,
} from "lucide-react"
import type { CategoriaDespesa, RegrasPolitica, ReembolsavelRegra } from "@contracts/types"
import { CATEGORIA_META } from "@/components/despesas/meta"
import { formatBRL } from "@/lib/format"
import { cn } from "@/lib/utils"
import { agruparObservacoes } from "./observacoes"
import { REEMBOLSAVEL_LABELS, agruparPorTema, resumoValor } from "./regrasExtraidas"

const BADGE_REEMBOLSAVEL: Record<ReembolsavelRegra, string> = {
  sim: "bg-conf-alta-bg text-conf-alta-text",
  excecao: "bg-conf-media-bg text-conf-media-text",
  vedado: "bg-conf-vedado-bg text-conf-vedado-text",
}

interface PoliticaResumoProps {
  regras: RegrasPolitica
  className?: string
}

function Linha({
  icone: Icone,
  titulo,
  children,
}: {
  icone: typeof CircleCheck
  titulo: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-text-500">
        <Icone className="h-3 w-3" />
        {titulo}
      </span>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  )
}

function ChipCategoria({ categoria, extra }: { categoria: CategoriaDespesa; extra?: string }) {
  const meta = CATEGORIA_META[categoria]
  const Icone = meta?.icon
  return (
    <span className="inline-flex h-6 items-center gap-1.5 rounded-md border border-line bg-paper px-2 text-[11px] font-medium text-text-900">
      {Icone && <Icone className="h-3 w-3 text-text-500" />}
      {meta?.label ?? categoria}
      {extra && <span className="font-mono text-[10px] font-semibold tabular text-text-500">{extra}</span>}
    </span>
  )
}

function ChipValor({ rotulo, valor, tone }: { rotulo: string; valor: number; tone: "alta" | "media" | "vedado" }) {
  const tones = {
    alta: "border-conf-alta-dot/25 bg-conf-alta-bg text-conf-alta-text",
    media: "border-conf-media-dot/25 bg-conf-media-bg text-conf-media-text",
    vedado: "border-conf-vedado-dot/25 bg-conf-vedado-bg text-conf-vedado-text",
  }
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-md border px-2 text-[11px] font-medium",
        tones[tone],
      )}
    >
      {rotulo}
      <span className="font-mono text-[10px] font-semibold tabular">{formatBRL(valor)}</span>
    </span>
  )
}

/**
 * Resumo legível das regras da política de reembolso ativa (v1.1.0): limites
 * por categoria, exigências (veículo / evidência), limiares de decisão
 * automática e observações extraídas do documento. Com regras estruturadas
 * (v1.7), lista as regras e, abaixo, o que o agente vai aplicar (derivado).
 */
export default function PoliticaResumo({ regras, className }: PoliticaResumoProps) {
  const limites = (Object.entries(regras.limitesPorCategoria ?? {}) as [CategoriaDespesa, number | null][])
    .filter(([, valor]) => valor != null)
  const temLimiares =
    regras.aprovacaoAutomaticaAte != null ||
    regras.revisaoHumanaAcimaDe != null ||
    regras.negacaoAcimaDe != null
  const temParametros =
    limites.length > 0 ||
    regras.exigeVeiculoCadastrado.length > 0 ||
    regras.exigeEvidencia.length > 0 ||
    temLimiares
  const semRegras = !temParametros && regras.observacoes.length === 0
  const estruturadas = regras.regrasExtraidas.length > 0

  if (semRegras && !estruturadas) {
    return (
      <p className={cn("font-mono text-[12px] text-text-500", className)}>
        Política sem regras específicas — toda despesa segue o fluxo padrão do motor tributário.
      </p>
    )
  }

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {estruturadas && (
        <>
          <Linha icone={StickyNote} titulo="Regras da política">
            <div className="flex w-full flex-col gap-2.5">
              {agruparPorTema(regras.regrasExtraidas)
                .filter((grupo) => grupo.itens.length > 0)
                .map((grupo) => (
                  <div key={grupo.tema} className="flex flex-col gap-1">
                    <span className="font-mono text-[10px] uppercase tracking-[0.04em] text-text-500">
                      {grupo.titulo}
                    </span>
                    <ul className="flex flex-col gap-1">
                      {grupo.itens.map((item) => {
                        const valor = resumoValor(item)
                        return (
                          <li key={item.id} className="flex flex-col gap-0.5 text-[12px] leading-relaxed">
                            <span className="flex flex-wrap items-center gap-1.5">
                              <span
                                className={cn(
                                  "inline-flex h-4 items-center rounded-full px-1.5 font-mono text-[9px] font-medium uppercase tracking-[0.04em]",
                                  BADGE_REEMBOLSAVEL[item.reembolsavel],
                                )}
                              >
                                {REEMBOLSAVEL_LABELS[item.reembolsavel]}
                              </span>
                              <span className="text-text-900">{item.descricao}</span>
                              {valor && (
                                <span className="font-mono text-[10px] font-semibold tabular text-text-500">{valor}</span>
                              )}
                            </span>
                            {item.condicao && (
                              <span className="text-[11px] leading-relaxed text-text-500">{item.condicao}</span>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                ))}
            </div>
          </Linha>

          <div className="border-t border-dashed border-line" />
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-text-500">
              O que o agente vai aplicar
            </span>
            <p className="text-[11px] leading-relaxed text-text-500">
              Derivado automaticamente das regras acima — não editável.
            </p>
          </div>
          {!temParametros && (
            <p className="font-mono text-[12px] text-text-500">
              Nenhum limite ou teto numérico — toda despesa vai para revisão humana.
            </p>
          )}
        </>
      )}

      {limites.length > 0 && (
        <Linha icone={CircleX} titulo="Teto por categoria">
          {limites.map(([categoria, valor]) => (
            <ChipCategoria key={categoria} categoria={categoria} extra={`até ${formatBRL(valor!)}`} />
          ))}
        </Linha>
      )}

      {regras.exigeVeiculoCadastrado.length > 0 && (
        <Linha icone={CarFront} titulo="Exige veículo cadastrado">
          {regras.exigeVeiculoCadastrado.map((categoria) => (
            <ChipCategoria key={categoria} categoria={categoria} />
          ))}
        </Linha>
      )}

      {regras.exigeEvidencia.length > 0 && (
        <Linha icone={Paperclip} titulo="Exige evidência documental">
          {regras.exigeEvidencia.map((categoria) => (
            <ChipCategoria key={categoria} categoria={categoria} />
          ))}
        </Linha>
      )}

      {temLimiares && (
        <Linha icone={ScanSearch} titulo="Decisão automática">
          {regras.aprovacaoAutomaticaAte != null && (
            <ChipValor rotulo="aprova até" valor={regras.aprovacaoAutomaticaAte} tone="alta" />
          )}
          {regras.revisaoHumanaAcimaDe != null && (
            <ChipValor rotulo="revisão humana acima de" valor={regras.revisaoHumanaAcimaDe} tone="media" />
          )}
          {regras.negacaoAcimaDe != null && (
            <ChipValor rotulo="nega acima de" valor={regras.negacaoAcimaDe} tone="vedado" />
          )}
        </Linha>
      )}

      {!estruturadas && regras.observacoes.length > 0 && (
        <Linha icone={StickyNote} titulo="Observações da política">
          <div className="flex w-full flex-col gap-2.5">
            {agruparObservacoes(regras.observacoes)
              .filter((grupo) => grupo.itens.length > 0)
              .map((grupo) => (
                <div key={grupo.indiceCabecalho ?? "sem-tema"} className="flex flex-col gap-1">
                  <span className="font-mono text-[10px] uppercase tracking-[0.04em] text-text-500">
                    {grupo.tema ?? "Sem tema"}
                  </span>
                  <ul className="flex flex-col gap-1">
                    {grupo.itens.map((item) => (
                      <li
                        key={item.indice}
                        className="flex items-start gap-2 text-[12px] leading-relaxed text-text-500"
                      >
                        <CircleCheck className="mt-0.5 h-3 w-3 shrink-0 text-conf-alta-dot" />
                        {item.texto}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </div>
        </Linha>
      )}
    </div>
  )
}

import { useMemo, useState } from "react"
import {
  Bot,
  ChevronsDownUp,
  ChevronsUpDown,
  CircleAlert,
  CircleCheck,
  CircleX,
  Paperclip,
  Receipt,
  ScanSearch,
  StickyNote,
} from "lucide-react"
import type { CategoriaDespesa, RegrasPolitica, ReembolsavelRegra } from "@contracts/types"
import { CATEGORIA_META } from "@/components/despesas/meta"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { formatBRL } from "@/lib/format"
import { cn } from "@/lib/utils"
import { agruparObservacoes } from "./observacoes"
import {
  REEMBOLSAVEL_LABELS_CURTO,
  TEXTO_SEM_APROVACAO_AUTOMATICA,
  UNIDADE_LABELS,
  agruparPorTema,
  contarRegras,
  formatarLimite,
  plural,
  resumoGrupo,
} from "./regrasExtraidas"

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
  rodape,
}: {
  icone: typeof CircleCheck
  titulo: string
  children: React.ReactNode
  /** Nota de rodapé do bloco, abaixo dos chips (fora do flex-wrap). */
  rodape?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-text-500">
        <Icone className="h-3 w-3" />
        {titulo}
      </span>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
      {rodape && <p className="text-[11px] leading-relaxed text-text-500">{rodape}</p>}
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
 * por categoria, exigência de evidência, limiares de decisão
 * automática e observações extraídas do documento. Com regras estruturadas
 * (v1.7), mostra cabeçalho de números, o que o agente vai aplicar (derivado)
 * em cards e as regras em accordion por tema.
 */
export default function PoliticaResumo({ regras, className }: PoliticaResumoProps) {
  const limites = (Object.entries(regras.limitesPorCategoria ?? {}) as [CategoriaDespesa, number | null][])
    .filter(([, valor]) => valor != null)
  const aprovaPorCategoria = (
    Object.entries(regras.aprovacaoAutomaticaPorCategoria ?? {}) as [CategoriaDespesa, number | undefined][]
  ).filter(([, valor]) => valor != null)
  /** Categorias em que a política só aceita nota fiscal/recibo — negação automática (v1.8). */
  const exigeDocPorCategoria = regras.exigeDocumentoFiscalPorCategoria ?? []
  /** O que o agente pode decidir SOZINHO — só o que a política declarou (D-013). */
  const decideSozinho =
    regras.aprovacaoAutomaticaAte != null ||
    aprovaPorCategoria.length > 0 ||
    regras.negacaoAcimaDe != null ||
    regras.categoriasVedadas.length > 0 ||
    regras.exigeDocumentoFiscal ||
    exigeDocPorCategoria.length > 0
  const lacunas = regras.lacunas ?? []
  const temParametros =
    limites.length > 0 ||
    regras.exigeEvidencia.length > 0 ||
    regras.revisaoHumanaAcimaDe != null ||
    lacunas.length > 0 ||
    decideSozinho
  const semRegras = !temParametros && regras.observacoes.length === 0
  const estruturadas = regras.regrasExtraidas.length > 0

  const contagem = useMemo(() => contarRegras(regras.regrasExtraidas), [regras.regrasExtraidas])
  const grupos = useMemo(
    () => agruparPorTema(regras.regrasExtraidas).filter((g) => g.itens.length > 0),
    [regras.regrasExtraidas],
  )
  const [abertos, setAbertos] = useState<string[]>([])
  const todosAbertos = grupos.length > 0 && abertos.length === grupos.length

  if (semRegras && !estruturadas) {
    return (
      <p className={cn("font-mono text-[12px] text-text-500", className)}>
        Política sem regras específicas — toda despesa segue o fluxo padrão do motor tributário.
      </p>
    )
  }

  /** Parâmetros derivados (só os que têm conteúdo), na mesma ordem nos dois ramos. */
  function blocosParametros(): React.ReactNode[] {
    const blocos: React.ReactNode[] = []
    // Primeiro bloco, sempre presente: responde "o agente aprova alguma coisa sozinho?".
    // Silêncio aqui parecia funcionamento normal — agora a ausência é dita com todas as letras.
    blocos.push(
      <Linha key="decide" icone={Bot} titulo="O agente decide sozinho">
        {decideSozinho ? (
          <>
            {regras.aprovacaoAutomaticaAte != null && (
              <ChipValor rotulo="aprova até" valor={regras.aprovacaoAutomaticaAte} tone="alta" />
            )}
            {aprovaPorCategoria.map(([categoria, valor]) => (
              <ChipCategoria key={`aprova-${categoria}`} categoria={categoria} extra={`aprova até ${formatBRL(valor!)}`} />
            ))}
            {regras.negacaoAcimaDe != null && (
              <ChipValor rotulo="nega acima de" valor={regras.negacaoAcimaDe} tone="vedado" />
            )}
            {regras.categoriasVedadas.map((c) => (
              <ChipCategoria key={`nega-${c.categoria}`} categoria={c.categoria} extra="nega sempre" />
            ))}
            {/* Exigir nota fiscal também é negação automática: precisa aparecer aqui. */}
            {regras.exigeDocumentoFiscal && (
              <span className="inline-flex h-6 items-center gap-1.5 rounded-md border border-conf-vedado-dot/25 bg-conf-vedado-bg px-2 text-[11px] font-medium text-conf-vedado-text">
                <Receipt className="h-3 w-3" aria-hidden="true" />
                nega extrato e comprovante de pagamento
              </span>
            )}
            {exigeDocPorCategoria.map((c) => (
              <ChipCategoria
                key={`doc-${c.categoria}`}
                categoria={c.categoria}
                extra="só nota fiscal ou recibo"
              />
            ))}
          </>
        ) : (
          <p className="text-[12px] leading-relaxed text-text-500">{TEXTO_SEM_APROVACAO_AUTOMATICA}</p>
        )}
      </Linha>,
    )
    // Bloco sempre presente quando há regras estruturadas: o teto por categoria sumir da
    // tela parecia sumiço de dado — os tetos de sub-item deixaram de virar teto de
    // categoria de propósito (v1.8) e a tela precisa dizer isso.
    if (limites.length > 0 || estruturadas) {
      blocos.push(
        <Linha
          key="teto"
          icone={CircleX}
          titulo="Teto por categoria"
          rodape={
            limites.some(([categoria]) => regras.tetosTemporaisPorCategoria?.[categoria])
              ? "Teto por período: acima dele a despesa vai para a sua revisão, nunca é negada automaticamente."
              : undefined
          }
        >
          {limites.length === 0 && (
            <p className="text-[12px] leading-relaxed text-text-500">
              Nenhum — nenhuma regra está marcada como “Vale para a categoria inteira”. Limites de
              sub-item (lavanderia, frigobar) não viram teto da categoria.
            </p>
          )}
          {limites.map(([categoria, valor]) => {
            const unidade = regras.tetosTemporaisPorCategoria?.[categoria]
            return (
              <ChipCategoria
                key={categoria}
                categoria={categoria}
                extra={`até ${formatBRL(valor!)}${unidade ? ` ${UNIDADE_LABELS[unidade]}` : ""}`}
              />
            )
          })}
        </Linha>,
      )
    }
    if (regras.exigeEvidencia.length > 0) {
      blocos.push(
        <Linha key="evidencia" icone={Paperclip} titulo="Exige evidência documental">
          {regras.exigeEvidencia.map((categoria) => (
            <ChipCategoria key={categoria} categoria={categoria} />
          ))}
        </Linha>,
      )
    }
    if (regras.revisaoHumanaAcimaDe != null) {
      blocos.push(
        <Linha key="revisao" icone={ScanSearch} titulo="Vai para a sua revisão">
          <ChipValor rotulo="acima de" valor={regras.revisaoHumanaAcimaDe} tone="media" />
        </Linha>,
      )
    }
    // Onde a política não define, o agente não decide — e diz o que falta (v1.8).
    if (lacunas.length > 0) {
      blocos.push(
        <Linha key="lacunas" icone={CircleAlert} titulo="O que a política não define">
          <ul className="flex w-full flex-col gap-1.5">
            {lacunas.map((lacuna, idx) => (
              <li
                key={`${lacuna.tipo}-${lacuna.categoria ?? "todas"}-${idx}`}
                className="flex items-start gap-2 text-[12px] leading-relaxed text-conf-media-text"
              >
                <CircleAlert className="mt-0.5 h-3 w-3 shrink-0 text-conf-media-dot" aria-hidden="true" />
                {lacuna.motivo}
              </li>
            ))}
          </ul>
        </Linha>,
      )
    }
    return blocos
  }

  if (estruturadas) {
    return (
      <div className={cn("flex flex-col gap-4", className)}>
        <p className="font-mono text-[11px] tracking-[0.02em] text-text-500">
          <span className="font-semibold text-text-900">{plural(contagem.total, "regra")}</span>
          {" · "}
          {plural(contagem.sim, "reembolsável", "reembolsáveis")}
          {" · "}
          {plural(contagem.excecao, "exceção", "exceções")}
          {" · "}
          {plural(contagem.vedado, "vedada")}
          {" · "}
          {plural(contagem.temas, "tema")}
        </p>

        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-text-500">
              O que o agente vai aplicar
            </span>
            <p className="text-[11px] leading-relaxed text-text-500">
              Derivado automaticamente das regras — não editável.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {blocosParametros().map((bloco, idx) => (
              <div key={idx} className="rounded-lg border border-line bg-paper px-3 py-2.5">
                {bloco}
              </div>
            ))}
          </div>
        </div>

        {grupos.length > 0 && (
          <>
            <div className="border-t border-dashed border-line" />

            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-text-500">
                <StickyNote className="h-3 w-3" aria-hidden="true" />
                Regras da política
              </span>
              <button
                type="button"
                onClick={() => setAbertos(todosAbertos ? [] : grupos.map((g) => g.tema))}
                className="inline-flex h-11 items-center gap-1 rounded-md px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.04em] text-text-500 outline-none transition hover:bg-paper hover:text-text-900 focus-visible:ring-2 focus-visible:ring-ring/50 sm:h-7"
              >
                {todosAbertos ? (
                  <ChevronsDownUp className="h-3 w-3" aria-hidden="true" />
                ) : (
                  <ChevronsUpDown className="h-3 w-3" aria-hidden="true" />
                )}
                {todosAbertos ? "Recolher todos" : "Expandir todos"}
              </button>
            </div>

            <Accordion
              type="multiple"
              value={abertos}
              onValueChange={setAbertos}
              className="rounded-xl border border-line bg-surface px-3"
            >
              {grupos.map((grupo) => (
                <AccordionItem key={grupo.tema} value={grupo.tema} className="border-line">
                  <AccordionTrigger className="py-3 hover:no-underline">
                    <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="text-[13px] font-semibold text-text-900">{grupo.titulo}</span>
                      <span className="font-mono text-[10px] tracking-[0.02em] text-text-500">
                        {resumoGrupo(grupo.itens)}
                      </span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pb-3">
                    <ul className="flex flex-col divide-y divide-line/60">
                      {grupo.itens.map((item, idx) => {
                        const valor = formatarLimite(item)
                        return (
                          <li
                            key={`${item.id}-${idx}`}
                            className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-2 gap-y-0.5 py-1.5 text-[12px] leading-relaxed"
                          >
                            <span
                              className={cn(
                                "mt-0.5 inline-flex h-4 w-[58px] items-center justify-center rounded-full font-mono text-[9px] font-medium uppercase tracking-[0.04em]",
                                BADGE_REEMBOLSAVEL[item.reembolsavel],
                              )}
                            >
                              {REEMBOLSAVEL_LABELS_CURTO[item.reembolsavel]}
                            </span>
                            <span className="min-w-0 break-words text-text-900">{item.descricao}</span>
                            <span className="whitespace-nowrap text-right font-mono text-[11px] font-semibold tabular text-text-900">
                              {valor ?? ""}
                            </span>
                            {item.condicao && (
                              <span className="col-span-2 col-start-2 min-w-0 break-words text-[11px] leading-relaxed text-text-500">
                                {item.condicao}
                              </span>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </>
        )}
      </div>
    )
  }

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {blocosParametros()}

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

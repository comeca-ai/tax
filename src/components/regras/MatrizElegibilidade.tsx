import { motion } from "framer-motion"
import type { CategoriaDespesa, RegimeTributario, TipoBeneficio, Tributo } from "@contracts/types"
import ConfidenceBadge from "@/components/app/ConfidenceBadge"
import { cn } from "@/lib/utils"
import {
  CATEGORIA_ROTULO,
  CATEGORIAS_ORDEM,
  LINHAS_MATRIZ,
  cnaeMatch,
  isMediaAlta,
} from "./labels"
import type { RegraRow } from "./labels"
import type { CelulaSelecionada } from "./RegraDetalheModal"

const CHIP_ESTILO: Record<string, { dot: string; text: string; bg: string }> = {
  alta: { dot: "bg-conf-alta-dot", text: "text-conf-alta-dot", bg: "bg-conf-alta-dot/10" },
  media: { dot: "bg-conf-media-dot", text: "text-conf-media-dot", bg: "bg-conf-media-dot/10" },
  baixa: { dot: "bg-conf-baixa-dot", text: "text-conf-baixa-dot", bg: "bg-conf-baixa-dot/10" },
  vedado: { dot: "bg-conf-vedado-dot", text: "text-conf-vedado-dot", bg: "bg-conf-vedado-dot/10" },
}

const VEDADO_LISTRADO = {
  backgroundImage:
    "repeating-linear-gradient(135deg, rgba(220,38,38,0.14) 0 6px, rgba(220,38,38,0.04) 6px 12px)",
}

interface MatrizElegibilidadeProps {
  regras: RegraRow[]
  versao: string
  regime: RegimeTributario
  tributo: Tributo | "todos"
  tipoBeneficio: TipoBeneficio | "todos"
  busca: string
  cnaeEmpresa: string | null
  onCellClick: (sel: CelulaSelecionada) => void
}

function ChipCelula({
  regra,
  mediaAlta,
  marcada,
  onClick,
}: {
  regra: RegraRow | null
  mediaAlta: boolean
  marcada: boolean
  onClick: () => void
}) {
  if (!regra) {
    return (
      <span className="inline-flex h-6 items-center rounded-full px-2 font-mono text-[11px] text-text-dark-400/50">
        —
      </span>
    )
  }
  const estilo = CHIP_ESTILO[regra.confianca]!
  const rotulo =
    regra.confianca === "media" && mediaAlta
      ? "Média+"
      : regra.confianca === "media"
        ? "Média"
        : regra.confianca === "alta"
          ? "Alta"
          : regra.confianca === "baixa"
            ? "Baixa"
            : "Vedado"
  return (
    <button
      type="button"
      onClick={onClick}
      style={regra.confianca === "vedado" ? VEDADO_LISTRADO : undefined}
      className={cn(
        "inline-flex h-6 cursor-pointer items-center gap-1.5 rounded-full px-2 font-mono text-[11px] font-medium uppercase tracking-[0.04em] ring-1 ring-inset ring-white/5 transition-transform duration-150 hover:scale-[1.08]",
        estilo.bg,
        estilo.text,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", estilo.dot)} />
      {rotulo}
      {marcada && <span className="text-conf-media-dot">*</span>}
    </button>
  )
}

/** Matriz signature dark: linhas = CNAE/setor, colunas = categorias + dedutibilidade. */
export default function MatrizElegibilidade({
  regras,
  versao,
  regime,
  tributo,
  tipoBeneficio,
  busca,
  cnaeEmpresa,
  onCellClick,
}: MatrizElegibilidadeProps) {
  const regrasVersao = regras.filter((r) => r.versao === versao)

  function regraCredito(padroes: string[], categoria: CategoriaDespesa): RegraRow | null {
    const candidatas = regrasVersao.filter(
      (r) =>
        padroes.includes(r.cnaePadrao) &&
        r.categoria === categoria &&
        r.tipoBeneficio === "credito" &&
        (tributo === "todos" || r.tributo === tributo),
    )
    if (candidatas.length === 0) return null
    if (tributo !== "todos") return candidatas[0] ?? null
    // Visão canônica: PIS/COFINS representa a célula (ICMS acompanha a mesma confiança).
    return candidatas.find((r) => r.tributo === "pis_cofins") ?? candidatas[0] ?? null
  }

  function regraDedutibilidade(categoria: CategoriaDespesa): RegraRow | null {
    return (
      regrasVersao.find(
        (r) => r.tipoBeneficio === "dedutibilidade" && r.categoria === categoria,
      ) ?? null
    )
  }

  function regrasDaCelula(
    padroes: string[],
    categoria: CategoriaDespesa,
    dedutibilidade: boolean,
  ): RegraRow[] {
    if (dedutibilidade) {
      return regrasVersao.filter(
        (r) => r.tipoBeneficio === "dedutibilidade" && r.categoria === categoria,
      )
    }
    return regrasVersao.filter(
      (r) =>
        padroes.includes(r.cnaePadrao) &&
        r.categoria === categoria &&
        r.tipoBeneficio === "credito",
    )
  }

  const termo = busca.trim().toLowerCase()
  const linhasVisiveis = LINHAS_MATRIZ.filter(
    (l) =>
      !termo ||
      l.setor.toLowerCase().includes(termo) ||
      l.cnaeLabel.toLowerCase().includes(termo) ||
      l.padroes.some((p) => p.toLowerCase().includes(termo)),
  )

  const mostraDedutibilidade = tipoBeneficio !== "credito"
  const regimeAlteraCelulas = regime !== "lucro_real"

  return (
    <div className="overflow-hidden rounded-[14px] border border-line-dark bg-ink-900 shadow-card">
      {/* Legend bar */}
      <motion.div
        initial={{ opacity: 0, x: -16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line-dark px-5 py-3"
      >
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-dark-400">
          Legenda
        </span>
        <ConfidenceBadge level="alta" />
        <ConfidenceBadge level="media" />
        <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-conf-media-bg px-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.04em] text-conf-media-text">
          <span className="h-1.5 w-1.5 rounded-full bg-conf-media-dot" />
          Média+
        </span>
        <ConfidenceBadge level="baixa" />
        <ConfidenceBadge level="vedado" />
        <span
          className="inline-flex h-6 items-center rounded px-2 font-mono text-[10px] uppercase tracking-[0.04em] text-conf-vedado-dot"
          style={VEDADO_LISTRADO}
        >
          listrado = vedado
        </span>
        <span className="ml-auto hidden font-mono text-[10px] tracking-[0.02em] text-text-dark-400 sm:inline">
          clique na célula para ver base legal, vigência e versão
        </span>
      </motion.div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] border-collapse">
          <thead>
            <tr className="border-b border-line-dark">
              <th className="sticky left-0 z-10 bg-ink-900 px-5 py-3 text-left font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-text-dark-400">
                CNAE · Setor
              </th>
              {CATEGORIAS_ORDEM.map((cat) => (
                <th
                  key={cat}
                  className="px-3 py-3 text-center font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-text-dark-400"
                >
                  {CATEGORIA_ROTULO[cat]}
                  {cat === "combustivel" && regimeAlteraCelulas && (
                    <span className="text-conf-media-dot"> *</span>
                  )}
                </th>
              ))}
              <th className="px-3 py-3 text-center font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-text-dark-400">
                Dedutibilidade
                <br />
                IRPJ/CSLL
              </th>
            </tr>
          </thead>
          <tbody>
            {linhasVisiveis.map((linha, i) => {
              const suaEmpresa = linha.padroes.some((p) => cnaeMatch(p, cnaeEmpresa))
              return (
                <motion.tr
                  key={linha.cnaeLabel}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.05 * i, ease: "easeOut" }}
                  className={cn(
                    "group border-b border-line-dark/60 transition-colors last:border-b-0 hover:bg-ink-800",
                    suaEmpresa && "bg-brand-900/20",
                  )}
                >
                  <td
                    className={cn(
                      "sticky left-0 z-10 bg-ink-900 px-5 py-3 transition-colors group-hover:bg-ink-800",
                      suaEmpresa && "bg-[#0E1A14] shadow-[inset_3px_0_0_0_#2BE08C] group-hover:bg-[#12211A]",
                    )}
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="flex items-center gap-2">
                        <span className="font-mono text-[12px] tabular text-text-dark-100">
                          {linha.cnaeLabel}
                        </span>
                        {suaEmpresa && (
                          <span className="rounded-full border border-brand-400/40 px-1.5 font-mono text-[9px] uppercase tracking-[0.06em] text-brand-400">
                            sua empresa
                          </span>
                        )}
                      </span>
                      <span className="text-[12px] text-text-dark-400">{linha.setor}</span>
                    </div>
                  </td>
                  {CATEGORIAS_ORDEM.map((cat) => {
                    const dedut = tipoBeneficio === "dedutibilidade"
                    const regra = dedut
                      ? regraDedutibilidade(cat)
                      : regraCredito(linha.padroes, cat)
                    const relacionadas = regrasDaCelula(linha.padroes, cat, dedut)
                    const mediaAlta =
                      !dedut && linha.padroes.some((p) => isMediaAlta(p, cat))
                    return (
                      <td key={cat} className="px-3 py-3 text-center">
                        <motion.div
                          key={`${regime}-${tributo}-${tipoBeneficio}-${versao}`}
                          initial={{ scale: 0.85, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ duration: 0.25, ease: "easeOut" }}
                          className="inline-block"
                        >
                          <ChipCelula
                            regra={regra}
                            mediaAlta={mediaAlta}
                            marcada={regimeAlteraCelulas && cat === "combustivel" && regra !== null}
                            onClick={() =>
                              regra &&
                              onCellClick({
                                titulo: dedut
                                  ? `Dedutibilidade IRPJ/CSLL × ${CATEGORIA_ROTULO[cat]}`
                                  : `CNAE ${linha.cnaeLabel} × ${CATEGORIA_ROTULO[cat]}`,
                                categoria: cat,
                                dedutibilidade: dedut,
                                regraPrincipal: regra,
                                regrasRelacionadas: relacionadas,
                                mediaAlta,
                              })
                            }
                          />
                        </motion.div>
                      </td>
                    )
                  })}
                  <td className="px-3 py-3 text-center">
                    {mostraDedutibilidade ? (
                      <div className="flex flex-col items-center gap-1">
                        <ChipCelula
                          regra={regraDedutibilidade("combustivel")}
                          mediaAlta={false}
                          marcada={false}
                          onClick={() => {
                            const regra = regraDedutibilidade("combustivel")
                            if (!regra) return
                            onCellClick({
                              titulo: "Dedutibilidade IRPJ/CSLL — regra única",
                              categoria: null,
                              dedutibilidade: true,
                              regraPrincipal: regra,
                              regrasRelacionadas: regrasVersao.filter(
                                (r) => r.tipoBeneficio === "dedutibilidade",
                              ),
                              mediaAlta: false,
                            })
                          }}
                        />
                        <span className="font-mono text-[9px] tracking-[0.02em] text-text-dark-400">
                          regra única
                        </span>
                      </div>
                    ) : (
                      <span className="inline-flex h-6 items-center rounded-full px-2 font-mono text-[11px] text-text-dark-400/50">
                        —
                      </span>
                    )}
                  </td>
                </motion.tr>
              )
            })}
            {linhasVisiveis.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-10 text-center">
                  <p className="text-[13px] text-text-dark-400">
                    {regrasVersao.length === 0
                      ? "Nenhuma regra cadastrada nesta versão — selecione a versão atual para ver a matriz."
                      : `Nenhuma linha encontrada para “${busca}”.`}
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="border-t border-line-dark px-5 py-2.5">
        <p className="font-mono text-[10px] tracking-[0.02em] text-text-dark-400">
          {regrasVersao.length} regras · versão v{versao}
          {regimeAlteraCelulas &&
            " · * Simples Nacional / Lucro Presumido: crédito de PIS/COFINS não se aplica — células de combustível mudam"}
          {tributo !== "todos" && " · filtrando por tributo"}
        </p>
      </div>
    </div>
  )
}

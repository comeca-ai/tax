import { useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { X } from "lucide-react"
import { buscarCnaes, cnaePorCodigo } from "@/lib/cnaes"
import type { Cnae } from "@/lib/cnaes"
import { cn } from "@/lib/utils"

interface CnaeComboboxProps {
  /** `false` = seleção única (CNAE principal); `true` = multi (secundários) */
  multi: boolean
  selecionados: string[]
  onChange: (codigos: string[]) => void
  placeholder: string
  /**
   * CNAEs fora da lista curada (ex.: vindos da Receita Federal, v1.3.0).
   * Entram na busca/seleção e resolvem código+descrição dos chips.
   */
  extras?: Cnae[]
}

/**
 * Combobox pesquisável de CNAE (tabela CONCLA/IBGE, subset em src/lib/cnaes).
 * Navegável por teclado (↑/↓/Enter/Esc). Código mono + descrição.
 */
export default function CnaeCombobox({ multi, selecionados, onChange, placeholder, extras }: CnaeComboboxProps) {
  const [aberto, setAberto] = useState(false)
  const [termo, setTermo] = useState("")
  const [destaque, setDestaque] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  /** Resolve código+descrição olhando a lista curada e depois os extras. */
  const porCodigo = useMemo(
    () => (codigo: string) =>
      cnaePorCodigo(codigo) ?? extras?.find((e) => e.codigo === codigo),
    [extras],
  )

  const opcoes = useMemo(() => {
    const curadas = buscarCnaes(termo)
    const t = termo.trim().toLowerCase()
    const extrasFiltrados = (extras ?? []).filter(
      (e) =>
        !cnaePorCodigo(e.codigo) &&
        (!t || e.codigo.toLowerCase().includes(t) || e.descricao.toLowerCase().includes(t)),
    )
    return [...extrasFiltrados, ...curadas].filter((c) => !selecionados.includes(c.codigo))
  }, [termo, selecionados, extras])

  const escolher = (codigo: string) => {
    if (multi) {
      onChange([...selecionados, codigo])
      setTermo("")
      setDestaque(0)
      inputRef.current?.focus()
    } else {
      onChange([codigo])
      setAberto(false)
      setTermo("")
    }
  }

  const valorUnico = !multi && selecionados[0] ? porCodigo(selecionados[0]) : undefined

  return (
    <div className="relative">
      {selecionados.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selecionados.map((codigo) => {
            const cnae = porCodigo(codigo)
            return (
              <span
                key={codigo}
                className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-brand-500/10 py-1 pl-2.5 pr-1.5 text-[12px] font-medium text-brand-500 ring-1 ring-brand-500/30"
              >
                <span className="font-mono tabular">{codigo}</span>
                <span className="max-w-[220px] truncate">{cnae?.descricao ?? ""}</span>
                <button
                  type="button"
                  aria-label={`Remover CNAE ${codigo}`}
                  onClick={() => onChange(selecionados.filter((c) => c !== codigo))}
                  className="flex h-4 w-4 items-center justify-center rounded-full transition-colors hover:bg-brand-500/20"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )
          })}
        </div>
      )}

      {!(valorUnico && !aberto) && (
        <input
          ref={inputRef}
          type="text"
          value={termo}
          placeholder={placeholder}
          onFocus={() => setAberto(true)}
          onBlur={() => setTimeout(() => setAberto(false), 150)}
          onChange={(e) => {
            setTermo(e.target.value)
            setDestaque(0)
            setAberto(true)
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault()
              setDestaque((d) => Math.min(d + 1, opcoes.length - 1))
            } else if (e.key === "ArrowUp") {
              e.preventDefault()
              setDestaque((d) => Math.max(d - 1, 0))
            } else if (e.key === "Enter") {
              e.preventDefault()
              const opcao = opcoes[destaque]
              if (opcao) escolher(opcao.codigo)
            } else if (e.key === "Escape") {
              setAberto(false)
            }
          }}
          className={cn(
            "h-11 w-full rounded-[10px] border border-line bg-surface px-3.5 text-sm text-text-900 outline-none transition-[border,box-shadow] duration-150 placeholder:text-text-500/60",
            "focus:border-brand-500 focus:shadow-[0_0_0_3px_rgba(14,169,104,0.18)]",
          )}
        />
      )}

      {valorUnico && !aberto && (
        <button
          type="button"
          onClick={() => {
            setAberto(true)
            setTimeout(() => inputRef.current?.focus(), 0)
          }}
          className="text-[12px] font-medium text-text-500 transition-colors hover:text-brand-500"
        >
          Trocar CNAE principal
        </button>
      )}

      <AnimatePresence>
        {aberto && opcoes.length > 0 && (
          <motion.ul
            initial={{ scaleY: 0.95, opacity: 0 }}
            animate={{ scaleY: 1, opacity: 1 }}
            exit={{ scaleY: 0.95, opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{ transformOrigin: "top" }}
            className="absolute z-20 mt-1.5 max-h-64 w-full overflow-y-auto rounded-[12px] border border-line bg-surface py-1 shadow-card"
          >
            {opcoes.map((cnae, i) => (
              <motion.li
                key={cnae.codigo}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.02, 0.2), duration: 0.15 }}
              >
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => escolher(cnae.codigo)}
                  onMouseEnter={() => setDestaque(i)}
                  className={cn(
                    "flex w-full items-baseline gap-2.5 px-3.5 py-2 text-left text-[13px]",
                    i === destaque ? "bg-paper" : "",
                  )}
                >
                  <span className="shrink-0 font-mono text-[12px] font-medium tabular text-brand-500">
                    {cnae.codigo}
                  </span>
                  <span className="truncate text-text-900">{cnae.descricao}</span>
                </button>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
}

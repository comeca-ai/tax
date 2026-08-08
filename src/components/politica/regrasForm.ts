import type { CategoriaDespesa, RegrasPolitica } from "@contracts/types"
import { numeroParaPt, parseNumeroPt } from "@/components/despesas/wizard/types"
import { CATEGORIA_META } from "@/components/despesas/meta"

export const CATEGORIAS_POLITICA = Object.keys(CATEGORIA_META) as CategoriaDespesa[]

/** Form de edição das regras (strings pt-BR; "" = sem limite / sem teto). */
export interface RegrasForm {
  limites: Record<CategoriaDespesa, string>
  exigeVeiculo: Record<CategoriaDespesa, boolean>
  exigeEvidencia: Record<CategoriaDespesa, boolean>
  aprovacaoAutomaticaAte: string
  revisaoHumanaAcimaDe: string
  negacaoAcimaDe: string
  observacoes: string[]
}

export function formFromRegras(regras: RegrasPolitica): RegrasForm {
  const limites = {} as Record<CategoriaDespesa, string>
  const exigeVeiculo = {} as Record<CategoriaDespesa, boolean>
  const exigeEvidencia = {} as Record<CategoriaDespesa, boolean>
  for (const cat of CATEGORIAS_POLITICA) {
    const limite = regras.limitesPorCategoria[cat]
    limites[cat] = limite != null ? numeroParaPt(limite) : ""
    exigeVeiculo[cat] = regras.exigeVeiculoCadastrado.includes(cat)
    exigeEvidencia[cat] = regras.exigeEvidencia.includes(cat)
  }
  return {
    limites,
    exigeVeiculo,
    exigeEvidencia,
    aprovacaoAutomaticaAte:
      regras.aprovacaoAutomaticaAte != null ? numeroParaPt(regras.aprovacaoAutomaticaAte) : "",
    revisaoHumanaAcimaDe:
      regras.revisaoHumanaAcimaDe != null ? numeroParaPt(regras.revisaoHumanaAcimaDe) : "",
    negacaoAcimaDe: regras.negacaoAcimaDe != null ? numeroParaPt(regras.negacaoAcimaDe) : "",
    observacoes: [...regras.observacoes],
  }
}

function teto(valor: string): number | null {
  const limpo = valor.trim()
  if (!limpo) return null
  const n = parseNumeroPt(limpo)
  return n > 0 ? n : null
}

export function regrasFromForm(form: RegrasForm): RegrasPolitica {
  const limitesPorCategoria: Partial<Record<CategoriaDespesa, number | null>> = {}
  for (const cat of CATEGORIAS_POLITICA) {
    limitesPorCategoria[cat] = teto(form.limites[cat])
  }
  return {
    limitesPorCategoria,
    exigeVeiculoCadastrado: CATEGORIAS_POLITICA.filter((cat) => form.exigeVeiculo[cat]),
    exigeEvidencia: CATEGORIAS_POLITICA.filter((cat) => form.exigeEvidencia[cat]),
    aprovacaoAutomaticaAte: teto(form.aprovacaoAutomaticaAte),
    revisaoHumanaAcimaDe: teto(form.revisaoHumanaAcimaDe),
    negacaoAcimaDe: teto(form.negacaoAcimaDe),
    observacoes: form.observacoes.map((o) => o.trim()).filter(Boolean),
  }
}

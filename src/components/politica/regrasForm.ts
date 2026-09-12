import type { CategoriaDespesa, RegraExtraida, RegrasPolitica } from "@contracts/types"
import { CATEGORIA_META } from "@/components/despesas/meta"

export const CATEGORIAS_POLITICA = Object.keys(CATEGORIA_META) as CategoriaDespesa[]

/**
 * Form do passo "Revisar regras": só as regras extraídas são editáveis. `base`
 * guarda o restante do JSON (parâmetros derivados no servidor ao salvar).
 */
export interface RegrasForm {
  base: RegrasPolitica
  regrasExtraidas: RegraExtraida[]
}

export function formFromRegras(regras: RegrasPolitica): RegrasForm {
  return { base: regras, regrasExtraidas: [...regras.regrasExtraidas] }
}

export function regrasFromForm(form: RegrasForm): RegrasPolitica {
  return { ...form.base, regrasExtraidas: form.regrasExtraidas }
}

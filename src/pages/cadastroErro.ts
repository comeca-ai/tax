/**
 * Tradução dos erros de `empresas.create` no wizard de cadastro (/cadastro).
 *
 * O wizard cria a conta e, em seguida, a empresa. Quando o segundo passo
 * falha, o usuário fica com conta e sem empresa (viola a RF-00) — por isso
 * aqui separamos a mensagem que vai à tela do detalhe técnico que vai ao
 * console, em vez de engolir o erro.
 *
 * Erros de validação do zod chegam pelo tRPC com `message` contendo o JSON
 * das issues; o restante (`UNAUTHORIZED`, por exemplo) já vem em PT-BR.
 */

/** Rótulos PT-BR dos campos de `empresaInput` (contracts/types.ts). */
const ROTULOS_CAMPO: Record<string, string> = {
  razaoSocial: "razão social",
  cnpj: "CNPJ",
  cnaePrincipal: "CNAE principal",
  cnaesSecundarios: "CNAEs secundários",
  regimeTributario: "regime tributário",
  uf: "UF",
  aceiteLgpd: "consentimento LGPD",
  declaracaoPoderes: "declaração de poderes",
}

/** Códigos cuja mensagem do servidor não serve para o usuário final. */
const CODIGOS_OPACOS = new Set(["INTERNAL_SERVER_ERROR", "TIMEOUT"])

export const ERRO_EMPRESA_GENERICO =
  "Sua conta foi criada, mas houve uma falha ao cadastrar a empresa. Tente novamente."

export interface ErroEmpresa {
  /** Código tRPC (`BAD_REQUEST`, `UNAUTHORIZED`, …), quando houver. */
  codigo: string | null
  /** Texto exibido ao usuário. */
  mensagem: string
  /** Detalhe para o console — nunca vai à tela. */
  tecnico: string
}

/** Código tRPC do erro de uma mutation, se houver. */
export function codigoTrpc(erro: unknown): string | null {
  const data = (erro as { data?: { code?: unknown } } | null)?.data
  return typeof data?.code === "string" ? data.code : null
}

interface IssueZod {
  path?: unknown
  message?: unknown
}

/**
 * Campos recusados pela validação do servidor. Devolve `null` quando a
 * mensagem não é o JSON de issues do zod.
 */
export function camposRecusados(mensagem: string): string[] | null {
  const texto = mensagem.trim()
  if (!texto.startsWith("[")) return null

  let issues: unknown
  try {
    issues = JSON.parse(texto)
  } catch {
    return null
  }
  if (!Array.isArray(issues) || issues.length === 0) return null

  const campos: string[] = []
  for (const issue of issues as IssueZod[]) {
    const path = Array.isArray(issue?.path) ? issue.path : []
    const raiz = typeof path[0] === "string" ? path[0] : ""
    const rotulo = ROTULOS_CAMPO[raiz] ?? raiz
    if (rotulo && !campos.includes(rotulo)) campos.push(rotulo)
  }
  return campos.length > 0 ? campos : null
}

/** Lista "a", "a e b", "a, b e c". */
function enumerar(itens: string[]): string {
  if (itens.length <= 1) return itens.join("")
  return `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`
}

/**
 * Traduz o erro de `empresas.create` em mensagem de tela + detalhe técnico.
 * Nunca lança: qualquer coisa inesperada cai na mensagem genérica.
 */
export function descreverErroEmpresa(erro: unknown): ErroEmpresa {
  const codigo = codigoTrpc(erro)
  const bruta = erro instanceof Error ? erro.message.trim() : ""
  const tecnico = `${codigo ?? "SEM_CODIGO"}: ${bruta || String(erro)}`

  const campos = bruta ? camposRecusados(bruta) : null
  if (campos) {
    return {
      codigo,
      tecnico,
      mensagem: `A empresa não foi cadastrada: o servidor recusou ${enumerar(
        campos
      )}. Revise esses dados e tente novamente.`,
    }
  }

  const opaca = !bruta || !codigo || CODIGOS_OPACOS.has(codigo)
  return {
    codigo,
    tecnico,
    mensagem: opaca
      ? ERRO_EMPRESA_GENERICO
      : `Sua conta foi criada, mas a empresa não: ${bruta}`,
  }
}

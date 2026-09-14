export function podeEditarPolitica(
  user: { id: number; perfil: string } | null,
  empresa: { usuarioId: number } | null,
) {
  return !!user && !!empresa && (user.perfil === "admin" || empresa.usuarioId === user.id)
}

export function pertenceAEmpresa(despesa: { empresaId: number } | null | undefined, empresaId: number | undefined) {
  return !!empresaId && despesa?.empresaId === empresaId
}

export function podeConfirmarDecisao(input: {
  empresaId?: number; somenteLeitura: boolean; pending: boolean;
  justificativa: string; exigeDelegacao: boolean; motivoDelegacao: string;
}) {
  return !!input.empresaId && !input.somenteLeitura && !input.pending
    && input.justificativa.trim().length >= 3 && input.justificativa.trim().length <= 2000
    && (!input.exigeDelegacao || (input.motivoDelegacao.trim().length >= 3 && input.motivoDelegacao.trim().length <= 2000))
}

export function erroArquivoPolitica(arquivo: { size: number; type: string }): string | null {
  if (arquivo.size <= 0) return "O documento está vazio."
  if (arquivo.size > 10 * 1024 * 1024) return "O documento deve ter até 10 MB."
  if (!["application/pdf", "image/jpeg", "image/png", "image/webp", "text/plain", "text/markdown"].includes(arquivo.type)) {
    return "Envie PDF, JPG, PNG, WebP, TXT ou Markdown."
  }
  return null
}

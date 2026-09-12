/** Lê um File como base64 (sem o prefixo data:...;base64,). */
export function fileParaBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const resultado = String(reader.result ?? "")
      const idx = resultado.indexOf(",")
      resolve(idx >= 0 ? resultado.slice(idx + 1) : resultado)
    }
    reader.onerror = () => reject(reader.error ?? new Error("Falha ao ler o arquivo"))
    reader.readAsDataURL(file)
  })
}

/** Tamanho de arquivo legível, ex. `1,2 MB`. */
export function formatTamanho(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

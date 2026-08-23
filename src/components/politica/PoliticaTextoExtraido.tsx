import { motion } from "framer-motion"
import { CircleAlert, FileSearch } from "lucide-react"
import type { ConfiancaExtracao } from "@contracts/types"
import { CONFIANCA_EXTRACAO_LABELS } from "@contracts/types"
import { cn } from "@/lib/utils"

interface PoliticaTextoExtraidoProps {
  texto: string | null
  confiancaExtracao: ConfiancaExtracao
  provedor: string
  avisos: string[]
  camposPendentesQtd: number
  className?: string
}

const DOT_CONFIANCA: Record<ConfiancaExtracao, string> = {
  alta: "bg-conf-alta-dot",
  media: "bg-conf-media-dot",
  baixa: "bg-conf-vedado-dot",
}

/**
 * Painel do passo 2 do wizard: texto lido do documento (OCR/decodificação),
 * confiança da extração e avisos do parser. Markdown do OCR é exibido como
 * texto puro — o objetivo é o gestor conferir o que foi lido, não formatar.
 */
export default function PoliticaTextoExtraido({
  texto,
  confiancaExtracao,
  provedor,
  avisos,
  camposPendentesQtd,
  className,
}: PoliticaTextoExtraidoProps) {
  const temTexto = texto !== null && texto.trim() !== ""

  return (
    <div className={cn("flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 shadow-card", className)}>
      {/* Cabeçalho + confiança da extração */}
      <div className="flex flex-col gap-2">
        <h3 className="text-[13px] font-semibold text-text-900">Texto lido do documento</h3>
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-2 text-[12px] font-medium text-text-900">
            <motion.span
              initial={{ scale: 1.4 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.4 }}
              title={`Confiança da extração: ${CONFIANCA_EXTRACAO_LABELS[confiancaExtracao]}`}
              className={cn("h-2.5 w-2.5 rounded-full", DOT_CONFIANCA[confiancaExtracao])}
            />
            Extração {CONFIANCA_EXTRACAO_LABELS[confiancaExtracao].toLowerCase()}
          </span>
          <span className="inline-flex items-center rounded-md border border-line bg-paper px-2 py-0.5 font-mono text-[10px] tracking-[0.02em] text-text-500">
            parser {provedor}
          </span>
          {camposPendentesQtd > 0 && (
            <span className="font-mono text-[11px] tracking-[0.02em] text-conf-media-text">
              {camposPendentesQtd} ponto(s) para conferir — veja os avisos abaixo
            </span>
          )}
        </div>
        <p className="text-[12px] leading-relaxed text-text-500">
          Confira se o que foi lido corresponde ao documento antes de revisar as regras.
        </p>
      </div>

      {/* Avisos do parser */}
      {avisos.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-lg border border-line bg-paper p-3">
          {avisos.map((aviso, i) => (
            <span
              key={i}
              className="flex items-start gap-2 font-mono text-[12px] leading-relaxed text-text-500"
            >
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-conf-media-dot" />
              {aviso}
            </span>
          ))}
        </div>
      )}

      {/* Corpo */}
      {temTexto ? (
        <>
          <pre className="max-h-[60vh] overflow-y-auto overflow-x-auto whitespace-pre-wrap break-words rounded-lg border border-line bg-paper p-3 font-mono text-[12px] leading-relaxed text-text-900">
            {texto}
          </pre>
          <span className="font-mono text-[11px] tracking-[0.02em] text-text-500">
            {texto.length.toLocaleString("pt-BR")} caracteres
          </span>
        </>
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-line bg-paper px-4 py-8 text-center">
          <FileSearch className="h-6 w-6 text-text-500" />
          <span className="text-[13px] font-medium text-text-900">
            Nenhum texto foi extraído deste documento
          </span>
          <p className="max-w-[32ch] text-[12px] leading-relaxed text-text-500">
            Arquivos binários sem camada de texto (PDF escaneado/imagem) só são lidos com o
            provedor de OCR ativo. Cadastre as regras manualmente ao lado.
          </p>
        </div>
      )}
    </div>
  )
}

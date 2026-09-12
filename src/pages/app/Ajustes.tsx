import { motion } from "framer-motion"
import { ScanLine } from "lucide-react"

/**
 * Configurações operacionais da plataforma. A rota é protegida por
 * RequireAdmin; dados de empresa e usuários comuns não expõem esta visão.
 */
export default function Ajustes() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="flex max-w-3xl flex-col gap-6"
    >
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-[-0.01em] text-text-900">Ajustes</h1>
        <p className="mt-1 text-sm text-text-500">Configurações operacionais da plataforma.</p>
      </header>

      <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5 shadow-card">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-brand-500/10 text-brand-500">
            <ScanLine className="h-4 w-4" />
          </span>
          <h2 className="text-[15px] font-semibold text-text-900">Leitor de notas</h2>
        </div>
        <p className="text-[13px] leading-relaxed text-text-500">
          O OCR processa documentos enviados nas despesas. A conferência dos campos extraídos
          continua disponível no fluxo de cada despesa, sem expor detalhes técnicos em Empresas.
        </p>
      </section>
    </motion.div>
  )
}

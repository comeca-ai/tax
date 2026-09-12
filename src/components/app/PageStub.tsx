import { motion } from "framer-motion"

interface PageStubProps {
  title: string
  description?: string
}

/** Temporary stub for /app/* pages — replaced by the real page implementations. */
export default function PageStub({ title, description }: PageStubProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="flex flex-col gap-2"
    >
      <h1 className="font-display text-2xl font-semibold tracking-[-0.01em] text-text-900">{title}</h1>
      {description && <p className="max-w-xl text-sm text-text-500">{description}</p>}
      <div className="mt-6 flex h-64 items-center justify-center rounded-xl border border-dashed border-line bg-surface">
        <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-text-500">
          Conteúdo em construção
        </span>
      </div>
    </motion.div>
  )
}

export default function QueryError({ titulo, onRetry }: { titulo: string; onRetry: () => void }) {
  return <section role="alert" className="rounded-xl border border-line bg-surface p-8"><h1 className="text-lg font-semibold">{titulo}</h1><p className="mt-2 text-sm text-text-500">Não foi possível consultar os dados. Nenhum resultado está confirmado.</p><button type="button" onClick={onRetry} className="mt-4 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white">Tentar novamente</button></section>
}

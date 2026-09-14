import { useState } from "react"
import { trpc } from "@/providers/trpc"
import { politicaTestarInput, type CategoriaDespesa } from "@contracts/types"
import { CATEGORIA_META } from "@/components/despesas/meta"
import VereditoPolitica from "./VereditoPolitica"

/** Usa o mesmo avaliador do servidor; nenhum veredito de exemplo é produzido. */
export default function PoliticaSimulador({ empresaId, politicaId }: { empresaId: number; politicaId?: number }) {
  const [categoria, setCategoria] = useState<CategoriaDespesa>("combustivel")
  const [valor, setValor] = useState("")
  const [temEvidencia, setTemEvidencia] = useState(false)
  const testar = trpc.politica.testar.useMutation()
  const input = politicaTestarInput.safeParse({ empresaId, politicaId, categoria, valorNota: Number(valor.replace(",", ".")), temEvidencia })
  const mudar = () => testar.reset()
  return <section className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5" aria-label="Simulador da política">
    <div><h3 className="text-[15px] font-semibold">Simular antes de ativar</h3><p className="mt-1 text-sm text-text-500">Teste um caso no avaliador real. A simulação não cria despesa nem executa pagamento.</p></div>
    <form className="flex flex-wrap items-end gap-4" onSubmit={event => { event.preventDefault(); if (input.success && valor.trim() && !testar.isPending) testar.mutate(input.data) }}>
      <label className="flex flex-1 flex-col gap-1 text-sm">Categoria<select disabled={testar.isPending} value={categoria} onChange={e => { setCategoria(e.target.value as CategoriaDespesa); mudar() }} className="h-10 rounded-lg border border-line bg-surface px-3">{Object.entries(CATEGORIA_META).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}</select></label>
      <label className="flex flex-1 flex-col gap-1 text-sm">Valor da nota (R$)<input disabled={testar.isPending} inputMode="decimal" value={valor} onChange={e => { setValor(e.target.value); mudar() }} placeholder="0,00" className="h-10 rounded-lg border border-line px-3 font-mono" /></label>
      <label className="flex h-10 items-center gap-2 text-sm"><input type="checkbox" disabled={testar.isPending} checked={temEvidencia} onChange={e => { setTemEvidencia(e.target.checked); mudar() }} />Com evidência</label>
      <button disabled={!input.success || !valor.trim() || testar.isPending} className="h-10 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white disabled:opacity-50">{testar.isPending ? "Simulando…" : "Simular caso"}</button>
    </form>
    {testar.isError && <p role="alert" className="text-sm text-conf-vedado-text">Não foi possível simular. {testar.error.message}</p>}
    {testar.isSuccess && !testar.data.resultado && <p role="status" className="text-sm text-text-500">Nenhuma política aplicável foi encontrada. Nenhum veredito foi produzido.</p>}
    {testar.isSuccess && testar.data.resultado && <VereditoPolitica {...testar.data.resultado} versao={testar.data.versao} />}
  </section>
}

import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";

export default function IdentificacaoColaborador({
  empresaId,
  despesaId,
  colaboradorAtual,
  centroCustoAtual,
}: {
  empresaId: number;
  despesaId: number;
  colaboradorAtual: string | null;
  centroCustoAtual: string | null;
}) {
  const [pessoaId, setPessoaId] = useState("");
  const [motivo, setMotivo] = useState("");
  const utils = trpc.useUtils();
  const opcoes = trpc.despesas.identificacao.opcoes.useQuery(
    { empresaId, despesaId },
    { retry: false }
  );
  const corrigir = trpc.despesas.identificacao.corrigir.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.despesas.get.invalidate({ id: despesaId }),
        utils.despesas.list.invalidate(),
        utils.revisao.fila.invalidate(),
      ]);
      setPessoaId("");
      setMotivo("");
      toast.success("Colaborador e centro de custo atualizados com histórico");
    },
    onError: async () => {
      await utils.despesas.get.invalidate({ id: despesaId });
    },
  });
  if (!opcoes.data?.permitido) return null;
  return (
    <details className="rounded-lg border border-line p-3 text-sm">
      <summary className="cursor-pointer font-medium text-text-900">
        Identificar ou corrigir colaborador
      </summary>
      <div className="mt-3 flex flex-col gap-3">
        <label className="text-text-500">
          Colaborador da empresa
          <select
            className="mt-1 block w-full rounded border border-line bg-surface p-2 text-text-900"
            value={pessoaId}
            onChange={event => setPessoaId(event.target.value)}
            disabled={corrigir.isPending}
          >
            <option value="">Selecione o solicitante</option>
            {opcoes.data.colaboradores.map(p => (
              <option key={p.id} value={p.id}>
                {p.nome} ·{" "}
                {p.centroCusto?.trim() || "Centro de custo não cadastrado"}
              </option>
            ))}
          </select>
        </label>
        <label className="text-text-500">
          Motivo da identificação ou correção
          <textarea
            className="mt-1 block w-full rounded border border-line bg-surface p-2 text-text-900"
            value={motivo}
            onChange={event => setMotivo(event.target.value)}
            maxLength={500}
            disabled={corrigir.isPending}
          />
        </label>
        <p className="text-xs text-text-500">
          O centro de custo será copiado do cadastro selecionado. A autoria e os
          valores anteriores ficam registrados.
        </p>
        <button
          type="button"
          className="rounded bg-brand-500 px-3 py-2 font-medium text-white disabled:opacity-50"
          disabled={!pessoaId || motivo.trim().length < 3 || corrigir.isPending}
          onClick={() =>
            corrigir.mutate({
              empresaId,
              despesaId,
              colaboradorId: Number(pessoaId),
              motivo,
              colaboradorAtual,
              centroCustoAtual,
            })
          }
        >
          {corrigir.isPending ? "Salvando…" : "Salvar identificação"}
        </button>
        {corrigir.isError && (
          <p role="alert" className="text-red-700">
            {corrigir.error.message}
          </p>
        )}
      </div>
    </details>
  );
}

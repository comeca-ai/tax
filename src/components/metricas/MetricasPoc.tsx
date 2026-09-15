import { periodoMetricas } from "./periodo";
import { useState } from "react";
import type { FormEvent } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { podeEditarPolitica } from "@/components/painel/seguranca";
import {
  campoButtonClass,
  campoInputClass,
} from "@/components/campo/formulario";

const erroTexto = (e: unknown) =>
  e instanceof Error
    ? e.message
    : "Não foi possível registrar. Tente novamente.";

export default function MetricasPoc({
  empresa,
  de,
  ate,
}: {
  empresa: { id: number; usuarioId: number } | undefined;
  de: string;
  ate: string;
}) {
  const { user, isLoading } = useAuth();
  if (isLoading)
    return <p role="status">Carregando permissões das métricas…</p>;
  if (!empresa) return <p>Selecione uma empresa para consultar as métricas.</p>;
  if (!podeEditarPolitica(user, empresa))
    return (
      <p>
        Métricas e registros do piloto disponíveis ao administrador da empresa.
      </p>
    );
  const periodo = periodoMetricas(de, ate);
  if (!periodo)
    return <p role="alert">Selecione um período válido para as métricas.</p>;
  return (
    <Painel
      key={`${empresa.id}:${de}:${ate}`}
      empresaId={empresa.id}
      periodo={periodo}
      autor={user?.nome ?? "Usuário autenticado"}
    />
  );
}
function Painel({
  empresaId,
  periodo,
  autor,
}: {
  empresaId: number;
  periodo: { inicio: string; fim: string };
  autor: string;
}) {
  const resumo = trpc.metricasPoc.resumo.useQuery(
    { empresaId, ...periodo },
    { retry: false }
  );
  const auditoria = trpc.metricasPoc.auditarAmostra.useMutation();
  const pagamento = trpc.campo.registrarPagamento.useMutation();
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const ocupado = auditoria.isPending || pagamento.isPending;
  async function registrar(
    event: FormEvent<HTMLFormElement>,
    tipo: "amostra" | "pagamento"
  ) {
    event.preventDefault();
    setErro("");
    setSucesso("");
    const form = event.currentTarget;
    const dados = new FormData(form);
    const texto = (nome: string) => String(dados.get(nome) ?? "");
    try {
      if (tipo === "amostra")
        await auditoria.mutateAsync({
          empresaId,
          despesaId: Number(texto("despesaId")),
          conjunto: texto("conjunto"),
          campo: texto("campo"),
          evidencia: texto("evidencia"),
          previsto: texto("previsto") === "sim",
          observado: texto("observado") === "sim",
        });
      else
        await pagamento.mutateAsync({
          empresaId,
          despesaId: Number(texto("despesaId")),
          referencia: texto("referencia"),
          // datetime-local representa o fuso do navegador; Date converte para UTC.
          pagoEm: new Date(texto("pagoEm")).toISOString(),
        });
      setSucesso(
        tipo === "amostra"
          ? "Avaliação registrada com autoria. A despesa foi preservada."
          : "Pagamento manual registrado com autoria."
      );
      form.reset();
      await resumo.refetch();
    } catch (e) {
      setErro(erroTexto(e));
    }
  }
  const input = (
    nome: string,
    rotulo: string,
    tipo = "text",
    minLength?: number,
    maxLength?: number
  ) => (
    <label className="flex flex-col gap-1">
      {rotulo}
      <input
        name={nome}
        type={tipo}
        required
        min={tipo === "number" ? 1 : undefined}
        step={tipo === "number" ? 1 : undefined}
        minLength={minLength}
        maxLength={maxLength}
        className={campoInputClass}
      />
    </label>
  );
  return (
    <section
      aria-label="Métricas do piloto"
      className="rounded-xl border border-line bg-surface p-5 space-y-4"
    >
      <h2 className="text-lg font-semibold">Métricas do piloto e registros</h2>
      <p>
        Empresa #{empresaId}. Despesas criadas no período selecionado, em UTC.
        Os filtros fiscais de tributo e confiança não restringem esta coorte.
      </p>
      {resumo.isLoading && <p role="status">Carregando métricas…</p>}
      {resumo.error && (
        <div role="alert">
          Não foi possível consultar as métricas.{" "}
          <button
            type="button"
            className={campoButtonClass}
            onClick={() => void resumo.refetch()}
          >
            Tentar novamente
          </button>
        </div>
      )}
      {!resumo.error && resumo.data && (
        <>
          <p>
            {resumo.data.denominadorDespesas} despesas · {resumo.data.emRevisao}{" "}
            em revisão · {resumo.data.pagamentosManuais} pagamentos manuais
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption>Tempos observados na coorte</caption>
              <thead>
                <tr>
                  <th>Intervalo</th>
                  <th>Média</th>
                  <th>Com dados</th>
                  <th>Sem dados ou inconsistentes</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ["Criação até decisão", resumo.data.criacaoAteDecisao],
                    ["Criação até pagamento", resumo.data.criacaoAtePagamento],
                    ["Decisão até pagamento", resumo.data.decisaoAtePagamento],
                  ] as const
                ).map(([nome, valor]) => (
                  <tr key={nome}>
                    <td>{nome}</td>
                    <td>
                      {valor.mediaMs === null
                        ? "Não disponível"
                        : `${(valor.mediaMs / 3600000).toFixed(2)} h`}
                    </td>
                    <td>{valor.denominador}</td>
                    <td>{valor.semDadosOuInconsistentes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3 className="font-semibold">Auditoria por conjunto e campo</h3>
          {!resumo.data.amostras.length && (
            <p>Nenhuma amostra registrada nesta coorte.</p>
          )}
          {resumo.data.amostras.map(a => (
            <p key={JSON.stringify([a.conjunto, a.campo])}>
              {a.conjunto} / {a.campo}: amostra {a.denominador}; VP{" "}
              {a.verdadeirosPositivos}, VN {a.verdadeirosNegativos}, FP{" "}
              {a.falsosPositivos}, FN {a.falsosNegativos}; acurácia{" "}
              {(a.acuracia * 100).toFixed(1)}%; precisão{" "}
              {a.precisao === null
                ? "não disponível"
                : `${(a.precisao * 100).toFixed(1)}%`}
              .
            </p>
          ))}
          <details>
            <summary>Limites dos indicadores</summary>
            <ul>
              {resumo.data.limites.map(l => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            <p>
              Registros inválidos desconsiderados:{" "}
              {resumo.data.registrosInvalidos}.
            </p>
          </details>
        </>
      )}
      <p>
        Responsável pelo registro: {autor}. A data de registro é gravada pelo
        servidor.
      </p>
      {erro && <p role="alert">{erro}</p>}
      {sucesso && <p role="status">{sucesso}</p>}
      <form onSubmit={e => void registrar(e, "amostra")} className="space-y-3">
        <h3 className="font-semibold">Registrar auditoria amostral</h3>
        <p>
          Defina a proposição binária no conjunto acordado. Positivo significa
          que a proposição foi identificada. Nova avaliação do mesmo item/campo
          preserva a anterior no histórico.
        </p>
        <fieldset disabled={ocupado} className="grid gap-3 md:grid-cols-2">
          {input("despesaId", "ID da despesa", "number")}
          {input("conjunto", "Conjunto de teste", "text", 3, 128)}
          {input("campo", "Campo ou proposição avaliada", "text", 1, 128)}
          {(
            [
              ["previsto", "Resultado previsto pelo sistema"],
              ["observado", "Resultado observado na conferência"],
            ] as const
          ).map(([nome, rotulo]) => (
            <label key={nome}>
              {rotulo}
              <select
                name={nome}
                required
                defaultValue=""
                className={campoInputClass}
              >
                <option value="" disabled>
                  Selecione
                </option>
                <option value="sim">Positivo</option>
                <option value="nao">Negativo</option>
              </select>
            </label>
          ))}
          <label>
            Evidência e referência examinada
            <textarea
              name="evidencia"
              required
              minLength={10}
              maxLength={2000}
              className={campoInputClass}
            />
          </label>
          <button className={campoButtonClass} type="submit">
            {auditoria.isPending ? "Registrando…" : "Registrar avaliação"}
          </button>
        </fieldset>
      </form>
      <form
        onSubmit={e => void registrar(e, "pagamento")}
        className="space-y-3"
      >
        <h3 className="font-semibold">Registrar pagamento manual</h3>
        <p>
          Informe uma despesa aprovada desta empresa. Este registro documenta um
          pagamento já realizado.
        </p>
        <fieldset disabled={ocupado} className="grid gap-3 md:grid-cols-2">
          {input("despesaId", "ID da despesa aprovada", "number")}
          {input("referencia", "Referência do pagamento", "text", 3, 128)}
          {input("pagoEm", "Pago em (horário local)", "datetime-local")}
          <button className={campoButtonClass} type="submit">
            {pagamento.isPending ? "Registrando…" : "Registrar pagamento"}
          </button>
        </fieldset>
      </form>
    </section>
  );
}

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/providers/trpc";
import { mensagemErro } from "@/lib/convites";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../api/router";
type Previa = inferRouterOutputs<AppRouter>["equipeLote"]["previa"];
type Resultado = inferRouterOutputs<AppRouter>["equipeLote"]["confirmar"];
const modelo =
  "nome;email;telefone;matricula;vinculo;superiorMatricula;equipe\nPessoa de Exemplo;pessoa@example.invalid;+5511999999999;001;CLT;;externa\n";
export default function ImportarEquipe({ empresaId }: { empresaId: number }) {
  const client = trpc.useUtils().client.equipeLote;
  const queryClient = useQueryClient();
  const [csv, setCsv] = useState("");
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [enviarConvites, setEnviarConvites] = useState(false);
  const [erroArquivo, setErroArquivo] = useState("");
  const validar = useMutation({
    mutationFn: () => client.previa.mutate({ empresaId, csv }),
    onSuccess: setPrevia,
  });
  const confirmar = useMutation({
    mutationFn: () =>
      client.confirmar.mutate({
        empresaId,
        csv,
        token: previa!.token!,
        confirmacao: true,
        enviarConvites,
      }),
    onSuccess: async r => {
      setResultado(r);
      await queryClient.invalidateQueries({ queryKey: ["colaboradores"] });
    },
  });
  const busy = validar.isPending || confirmar.isPending;
  function modeloCsv() {
    const url = URL.createObjectURL(
      new Blob(["\uFEFF" + modelo], { type: "text/csv;charset=utf-8" })
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "modelo-equipe.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section
      className="space-y-4 rounded-xl border border-line bg-surface p-5"
      aria-label="Importação da equipe"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold text-text-900">Importar equipe em lote</h3>
        <button
          type="button"
          onClick={modeloCsv}
          className="text-sm text-brand-500"
        >
          Baixar modelo CSV
        </button>
      </div>
      <p className="text-sm text-text-500">
        Exporte a planilha em CSV UTF-8, com até 100 pessoas. Use telefone com +
        e código do país, vínculo CLT/MEI/PJ e matrícula do superior. A prévia
        mostra erros antes de cadastrar ou convidar.
      </p>
      <label className="block text-sm">
        Planilha CSV
        <input
          type="file"
          accept=".csv,text/csv"
          disabled={busy}
          className="mt-2 block w-full"
          onChange={async e => {
            const file = e.target.files?.[0];
            setPrevia(null);
            setResultado(null);
            setCsv("");
            setEnviarConvites(false);
            setErroArquivo("");
            validar.reset();
            confirmar.reset();
            if (!file) return;
            if (file.size > 200_000) {
              setErroArquivo("O arquivo deve ter no máximo 200 KB.");
              return;
            }
            try {
              setCsv(await file.text());
            } catch {
              setErroArquivo("Não foi possível ler o arquivo.");
            }
          }}
        />
      </label>
      <button
        type="button"
        disabled={!csv || busy}
        onClick={() => {
          setPrevia(null);
          setResultado(null);
          validar.mutate();
        }}
        className="rounded-lg border border-line px-4 py-2 text-sm disabled:opacity-50"
      >
        {validar.isPending ? "Validando…" : "Validar e ver resumo"}
      </button>
      {(erroArquivo || validar.error || confirmar.error) && (
        <p role="alert" className="text-sm text-red-600">
          {erroArquivo ||
            mensagemErro(
              validar.error || confirmar.error,
              "Não foi possível concluir. Gere uma nova prévia."
            )}
        </p>
      )}
      {previa && (
        <div className="space-y-3">
          <p className="text-sm">
            {previa.total} pessoas na planilha · {previa.erros.length} erros.
            Nenhum cadastro foi realizado pela prévia.
          </p>
          {previa.erros.length > 0 && (
            <ul className="max-h-60 overflow-auto text-sm text-red-600">
              {previa.erros.map((e, i) => (
                <li key={i}>
                  Linha {e.linha}, {e.campo}: {e.mensagem}
                </li>
              ))}
            </ul>
          )}
          <div className="max-h-72 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  {[
                    "Linha",
                    "Nome",
                    "Matrícula",
                    "Vínculo",
                    "Superior",
                    "Equipe",
                  ].map(h => (
                    <th className="p-2" key={h}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previa.linhas.map(l => (
                  <tr key={l.linha}>
                    {[
                      l.linha,
                      l.pessoa.nome,
                      l.pessoa.matricula,
                      l.pessoa.vinculo,
                      l.pessoa.superiorMatricula || "Sem superior",
                      l.pessoa.equipe,
                    ].map((v, i) => (
                      <td key={i} className="p-2">
                        {v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {previa.token && !resultado && (
            <>
              <label className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={enviarConvites}
                  disabled={busy}
                  onChange={e => setEnviarConvites(e.target.checked)}
                />
                Também autorizo o envio dos convites após o cadastro.
              </label>
              <button
                type="button"
                disabled={busy}
                onClick={() => confirmar.mutate()}
                className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {confirmar.isPending
                  ? "Confirmando…"
                  : enviarConvites
                    ? "Confirmar cadastro e envio de convites"
                    : "Confirmar cadastro das pessoas"}
              </button>
            </>
          )}
        </div>
      )}
      {resultado && (
        <div role="status" className="space-y-2 text-sm">
          <p>
            {resultado.pessoas.length} pessoas cadastradas no lote{" "}
            {resultado.id}.
            {resultado.idempotente
              ? " A repetição recuperou o lote existente."
              : ""}
          </p>
          {resultado.convites.length ? (
            <ul>
              {resultado.convites.map(c => (
                <li key={c.colaboradorId}>
                  Colaborador {c.colaboradorId}: WhatsApp {c.status}; e-mail{" "}
                  {c.emailEnviado ? "enviado" : "não confirmado"}.
                </li>
              ))}
            </ul>
          ) : (
            <p>Convites não foram solicitados nesta confirmação.</p>
          )}
        </div>
      )}
    </section>
  );
}

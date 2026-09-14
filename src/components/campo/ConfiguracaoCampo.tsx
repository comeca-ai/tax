import { useState } from "react";
import type { inferRouterInputs } from "@trpc/server";
import type { AppRouter } from "../../../api/router";
import { trpc } from "@/providers/trpc";
import { Link } from "react-router";
import { toast } from "sonner";
import QueryError from "@/components/painel/QueryError";
import {
  campoButtonClass,
  campoInputClass,
  inteiroExplicito,
  mensagemErroCampo,
} from "./formulario";

type Config =
  inferRouterInputs<AppRouter>["campo"]["configurar"]["configuracao"];
const UFS =
  "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(
    " "
  );
const NUMEROS = [
  ["tarifaCentavosPorKm", "Tarifa por km (centavos)", 1, 100000],
  ["periodoDias", "Período de conciliação (dias)", 1, 366],
  ["prazoNotaDias", "Prazo para nota (dias)", 1, 366],
  ["intervaloLembreteDias", "Intervalo entre lembretes (dias)", 1, 366],
  ["limiteLembretes", "Limite de lembretes", 0, 10],
  ["retencaoLocalizacaoDias", "Retenção de localização (dias)", 1, 366],
  ["intervaloConsultaMapsMinutos", "Intervalo entre tentativas no Google Maps (minutos)", 1, 10080],
] as const;

function Formulario({
  empresaId,
  politica,
  atual,
}: {
  empresaId: number;
  politica: { id: number; versao: number };
  atual: Config | null;
}) {
  const [modo, setModo] = useState<Config["modo"] | "">(atual?.modo ?? "");
  const [valores, setValores] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      NUMEROS.map(([key]) => [key, key === "intervaloConsultaMapsMinutos" ? String(atual?.[key] ?? 30) : atual ? String(atual[key]) : ""])
    )
  );
  const pessoas = trpc.colaboradores.listar.useQuery(
    { empresaId },
    { retry: false }
  );
  const [tarifas, setTarifas] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      Object.entries(atual?.tarifasCentavosPorKmPorUf ?? {}).map(
        ([uf, valor]) => [uf, String(valor)]
      )
    )
  );
  const [vale, setVale] = useState(atual?.temValeRefeicao ?? false);
  const [mapsAutomatico, setMapsAutomatico] = useState(atual?.calculoMapsAutomatico ?? false);
  const [appCorporativo, setAppCorporativo] = useState(
    atual?.temContratoCorporativoApp ?? false
  );
  const [analista, setAnalista] = useState(atual?.analistaId ?? null);
  const [aprovador, setAprovador] = useState(atual?.aprovadorId ?? null);
  const tarifasValidas = Object.values(tarifas).every(
    v => !v || inteiroExplicito(v, 1, 100000) !== null
  );
  const [regra, setRegra] = useState(atual?.regraPercurso ?? "");
  const utils = trpc.useUtils();
  const salvar = trpc.campo.configurar.useMutation({
    onSuccess: async () => {
      await utils.campo.configuracao.invalidate({ empresaId });
      toast.success("Parâmetros registrados para a política ativa");
    },
  });
  const validos = NUMEROS.every(
    ([key, , min, max]) =>
      inteiroExplicito(valores[key] ?? "", min, max) !== null
  );
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={event => {
        event.preventDefault();
        if (
          !modo ||
          !validos ||
          !tarifasValidas ||
          pessoas.isError ||
          regra.trim().length < 10 ||
          salvar.isPending
        )
          return;
        const numeros = Object.fromEntries(
          NUMEROS.map(([key]) => [key, Number(valores[key])])
        ) as Pick<Config, (typeof NUMEROS)[number][0]>;
        salvar.mutate({
          empresaId,
          configuracao: {
            ...numeros,
            tarifasCentavosPorKmPorUf: Object.fromEntries(
              Object.entries(tarifas)
                .filter(([, v]) => v !== "")
                .map(([uf, v]) => [uf, Number(v)])
            ),
            temValeRefeicao: vale,
            calculoMapsAutomatico: mapsAutomatico,
            temContratoCorporativoApp: appCorporativo,
            analistaId: analista,
            aprovadorId: aprovador,
            modo,
            regraPercurso: regra.trim(),
            politicaId: politica.id,
            politicaVersao: politica.versao,
          },
        });
      }}
    >
      <p className="text-sm text-text-500">
        Vinculado à política ativa v{politica.versao}. Preencha os parâmetros
        aprovados pela empresa. Distância estimada não define, sozinha, direito
        ao reembolso.
      </p>
      {atual &&
        (atual.politicaId !== politica.id ||
          atual.politicaVersao !== politica.versao) && (
          <p role="alert" className="text-sm text-conf-media-text">
            A política mudou. Confira todos os parâmetros antes de vincular a
            nova versão.
          </p>
        )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm">
          Modo
          <select
            value={modo}
            disabled={salvar.isPending}
            onChange={e => setModo(e.target.value as Config["modo"])}
            className={campoInputClass}
          >
            <option value="">Selecione explicitamente</option>
            <option value="sombra">Sombra</option>
            <option value="assistido">Assistido</option>
            <option value="autonomo">Autônomo</option>
          </select>
        </label>
        {NUMEROS.map(([key, label, min, max]) => (
          <label key={key} className="flex flex-col gap-1 text-sm">
            {label}
            <input
              type="number"
              min={min}
              max={max}
              step="1"
              required
              disabled={salvar.isPending}
              value={valores[key]}
              onChange={e => setValores({ ...valores, [key]: e.target.value })}
              className={campoInputClass}
            />
          </label>
        ))}
      </div>
      <fieldset
        className="flex flex-col gap-3 rounded-lg border border-line p-4"
        disabled={salvar.isPending}
      >
        <legend className="px-2 text-sm font-semibold">
          Configuração da empresa
        </legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={mapsAutomatico} onChange={e => setMapsAutomatico(e.target.checked)} />
          Calcular distância automaticamente após o check-out
        </label>
        <p className="text-xs text-text-500">
          Os pontos são guardados antes da consulta. Se o Google Maps estiver indisponível,
          uma nova tentativa respeita o intervalo configurado. Jornadas já calculadas não
          são consultadas novamente. As consultas podem gerar cobrança no Google Maps.
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={vale}
            onChange={e => setVale(e.target.checked)}
          />
          Possui vale refeição
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={appCorporativo}
            onChange={e => setAppCorporativo(e.target.checked)}
          />
          Possui contrato corporativo de aplicativo de transporte
        </label>
        {pessoas.isError && (
          <p role="alert">
            Não foi possível consultar as pessoas da empresa.{" "}
            <button type="button" onClick={() => void pessoas.refetch()}>
              Tentar novamente
            </button>
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {(["Analista", "Aprovador"] as const).map(label => (
            <label key={label} className="flex flex-col gap-1 text-sm">
              {label} designado
              <select
                disabled={pessoas.isLoading || pessoas.isError}
                className={campoInputClass}
                value={(label === "Analista" ? analista : aprovador) ?? ""}
                onChange={e =>
                  (label === "Analista" ? setAnalista : setAprovador)(
                    e.target.value ? Number(e.target.value) : null
                  )
                }
              >
                <option value="">Não designado</option>
                {pessoas.data
                  ?.filter(
                    p =>
                      p.empresaId === empresaId && p.statusVinculo === "ativo"
                  )
                  .map(p => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
              </select>
            </label>
          ))}
        </div>
        <p className="text-xs text-text-500">
          Sem aprovador designado, a revisão fica com o administrador da
          empresa.
        </p>
        <details>
          <summary className="cursor-pointer text-sm font-semibold">
            Tarifas por UF (centavos por km)
          </summary>
          <p className="my-2 text-xs text-text-500">
            Preencha as UFs aprovadas na política. UF em branco permanece sem
            tarifa configurada.
          </p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {UFS.map(uf => (
              <label key={uf} className="flex flex-col gap-1 text-sm">
                {uf}
                <input
                  type="number"
                  min="1"
                  max="100000"
                  step="1"
                  className={campoInputClass}
                  value={tarifas[uf] ?? ""}
                  onChange={e =>
                    setTarifas({ ...tarifas, [uf]: e.target.value })
                  }
                />
              </label>
            ))}
          </div>
        </details>
      </fieldset>
      <label className="flex flex-col gap-1 text-sm">
        Regra de percurso comercial
        <textarea
          required
          minLength={10}
          maxLength={2000}
          disabled={salvar.isPending}
          value={regra}
          onChange={e => setRegra(e.target.value)}
          className="min-h-24 rounded-lg border border-line bg-surface p-3 text-sm"
        />
      </label>
      {salvar.isError && (
        <p role="alert" className="text-sm text-conf-vedado-text">
          Não foi possível salvar. {mensagemErroCampo(salvar.error)}
        </p>
      )}
      <button
        className={`${campoButtonClass} self-start`}
        disabled={
          !modo ||
          !validos ||
          !tarifasValidas ||
          pessoas.isLoading ||
          pessoas.isError ||
          regra.trim().length < 10 ||
          salvar.isPending
        }
      >
        {salvar.isPending ? "Salvando…" : "Salvar parâmetros"}
      </button>
    </form>
  );
}

export default function ConfiguracaoCampo({
  empresaId,
}: {
  empresaId: number;
}) {
  const politica = trpc.politica.ativa.useQuery(
    { empresaId },
    { retry: false }
  );
  const config = trpc.campo.configuracao.useQuery(
    { empresaId },
    { retry: false }
  );
  if (politica.isError || config.isError)
    return (
      <QueryError
        titulo="Parâmetros de campo indisponíveis"
        onRetry={() => {
          void politica.refetch();
          void config.refetch();
        }}
      />
    );
  if (politica.isLoading || config.isLoading)
    return (
      <p role="status" className="text-sm text-text-500">
        Carregando política e parâmetros…
      </p>
    );
  if (!politica.data)
    return (
      <p className="text-sm text-text-500">
        É necessário validar e ativar uma{" "}
        <Link className="text-brand-500 underline" to="/app/politica">
          política de reembolso
        </Link>{" "}
        antes de configurar campo.
      </p>
    );
  return (
    <Formulario
      key={`${politica.data.id}:${politica.data.versao}`}
      empresaId={empresaId}
      politica={politica.data}
      atual={config.data?.configuracao ?? null}
    />
  );
}

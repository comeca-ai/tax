import type { Uf } from "@contracts/empresas";
import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { MapPin, SlidersHorizontal, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { useActiveCompany } from "@/hooks/useActiveCompany";
import { podeEditarPolitica } from "@/components/painel/seguranca";
import QueryError from "@/components/painel/QueryError";
import VeiculosCampo from "@/components/campo/VeiculosCampo";
import ConfiguracaoCampo from "@/components/campo/ConfiguracaoCampo";
import {
  campoButtonClass,
  campoInputClass,
  colaboradorDaEmpresa,
  dataPagamentoUtc,
  documentoRegularizavel,
  mensagemErroCampo,
  periodoUtc,
} from "@/components/campo/formulario";

function Bloco({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5">
      <h2 className="text-[16px] font-semibold">{titulo}</h2>
      {children}
    </section>
  );
}
function dataHora(valor: string | null | undefined) {
  return valor ? new Date(valor).toLocaleString("pt-BR") : "Não informado";
}
function rotulo(valor: string) {
  return valor.replaceAll("_", " ");
}

function OperacaoCampo({
  empresaId,
  colaboradorId,
  cnpj,
  ativo,
}: {
  empresaId: number;
  colaboradorId: number;
  cnpj: string;
  ativo: boolean;
}) {
  const utils = trpc.useUtils();
  const consulta = trpc.campo.consultar.useQuery(
    { colaboradorId },
    { retry: false, refetchInterval: 10_000 }
  );
  const despesas = trpc.despesas.list.useQuery({ empresaId }, { retry: false });
  const veiculos = trpc.veiculos.listar.useQuery({ empresaId }, { retry: false });
  const vincular = trpc.campo.vincularPresenca.useMutation();
  const [veiculoPresenca, setVeiculoPresenca] = useState("");
  const calcular = trpc.campo.calcular.useMutation();
  const conciliar = trpc.campo.conciliar.useMutation();
  const documento = trpc.campo.registrarDocumento.useMutation();
  const revisar = trpc.campo.revisarDocumento.useMutation();
  const pagamento = trpc.campo.registrarPagamento.useMutation();
  const [veiculo, setVeiculo] = useState("");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [ufCalculo, setUfCalculo] = useState<Uf | "">("");
  const [metrosComerciais, setMetrosComerciais] = useState("");
  const [notaId, setNotaId] = useState("");
  const [revisao, setRevisao] = useState<{
    id: string;
    regular: boolean;
  } | null>(null);
  const [motivo, setMotivo] = useState("");
  const [despesaId, setDespesaId] = useState("");
  const [referencia, setReferencia] = useState("");
  const [pagoEm, setPagoEm] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [registroPagamento, setRegistroPagamento] = useState<string | null>(
    null
  );
  const pending =
    vincular.isPending ||
    calcular.isPending ||
    conciliar.isPending ||
    documento.isPending ||
    revisar.isPending ||
    pagamento.isPending;
  const busy = pending || !ativo;

  async function operar<T>(
    acao: () => Promise<T>,
    resultado: (value: T) => void
  ) {
    if (busy) return;
    setErro(null);
    try {
      const value = await acao();
      resultado(value);
      void utils.campo.consultar.invalidate({ colaboradorId });
    } catch (error) {
      setErro(mensagemErroCampo(error));
    }
  }

  if (consulta.isError || despesas.isError)
    return (
      <QueryError
        titulo="Operação de campo indisponível"
        onRetry={() => {
          void consulta.refetch();
          void despesas.refetch();
        }}
      />
    );
  if (consulta.isLoading || despesas.isLoading || !consulta.data)
    return (
      <p role="status" className="text-sm text-text-500">
        Carregando jornadas e documentos…
      </p>
    );
  const dados = consulta.data;
  const notas = (despesas.data ?? []).filter(
    d => d.empresaId === empresaId && d.notaFiscalId
  );
  const aprovadas = (despesas.data ?? []).filter(
    d => d.empresaId === empresaId && d.status === "aprovada"
  );
  const periodo = periodoUtc(inicio, fim);
  const placas = [
    ...new Set([
      ...dados.jornadas.map(j => j.veiculo),
      ...dados.documentos.map(d => d.veiculo),
    ]),
  ];
  const docRevisao = dados.documentos.find(d => d.id === revisao?.id);
  return (
    <div className="flex flex-col gap-5">
      {!ativo && (
        <p
          role="status"
          className="rounded-lg border border-line bg-surface p-4 text-sm"
        >
          Vínculo suspenso: consulta disponível, alterações bloqueadas.
        </p>
      )}
      {pending && (
        <p role="status" className="text-sm text-text-500">
          Processando operação. Aguarde a confirmação do servidor…
        </p>
      )}
      {erro && (
        <div
          role="alert"
          className="rounded-lg border border-conf-vedado-dot/25 bg-conf-vedado-bg p-4 text-sm text-conf-vedado-text"
        >
          Operação não confirmada: {erro}
        </div>
      )}
      <Bloco titulo="Check-in e check-out de presença">
        <p className="text-sm text-text-500">No WhatsApp: check-in → enviar localização → check-out → enviar localização. Não exige veículo ou política.</p>
        {!(dados.presencas?.length) && <p className="text-sm text-text-500">Nenhuma presença registrada para esta pessoa.</p>}
        {dados.presencas?.map(p => <article key={p.id} className="rounded-lg border border-line p-4" data-testid="presenca-campo">
          <p className="font-semibold">{p.pontos.at(-1)?.tipo === "check_out" ? "Presença encerrada" : "Presença aberta"}</p>
          <p className="text-xs text-text-500">ID: {p.id}</p>
            {p.pontos.map(evento => <p key={evento.id} className="mt-2 text-sm">
            {rotulo(evento.tipo)} · <time dateTime={evento.comandoEm}>{new Date(evento.comandoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} (Brasília)</time>
            {" · Localização: "}{evento.latitude}, {evento.longitude}
            {evento.nomeLocal ? ` · ${evento.nomeLocal}` : ""}{evento.endereco ? ` · ${evento.endereco}` : ""}
          </p>)}
          {p.jornadaId ? <p className="mt-2 text-sm">Vinculada à quilometragem.</p> : p.pontos.at(-1)?.tipo === "check_out" && <button type="button" className={campoButtonClass} disabled={busy || !veiculoPresenca} onClick={() => void operar(() => vincular.mutateAsync({ colaboradorId, presencaId: p.id, veiculo: veiculoPresenca }), () => toast.success("Presença vinculada à quilometragem."))}>Vincular à quilometragem</button>}
        </article>)}
        <details className="text-sm">
          <summary>Vincular presença à quilometragem depois</summary>
          <p className="my-2 text-text-500">Para calcular quilometragem e reembolso, cadastre o veículo e configure a política. Depois, selecione o veículo e vincule a presença encerrada.</p>
          <label>Veículo para quilometragem
            <select className={campoInputClass} value={veiculoPresenca} onChange={e => setVeiculoPresenca(e.target.value)}>
              <option value="">Selecione um veículo</option>
              {veiculos.data?.map(v => <option key={v.id} value={v.placa}>{v.placa}</option>)}
            </select>
          </label>
        </details>
      </Bloco>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Jornadas", dados.metricas.jornadas],
          ["Jornadas abertas", dados.metricas.jornadasIncompletas],
          ["Documentos regulares", dados.metricas.documentosRegulares],
          ["Pendências documentais", dados.metricas.pendenciasDocumentais],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-xl border border-line bg-surface p-4"
          >
            <p className="text-xs text-text-500">{label}</p>
            <p className="mt-2 font-mono text-2xl">{value}</p>
          </div>
        ))}
      </div>
      <VeiculosCampo
        empresaId={empresaId}
        colaboradorId={colaboradorId}
        ativo={ativo}
      />
      <Bloco titulo="Jornadas e cálculo posterior">
        <p className="text-sm text-text-500">
          Vincule uma presença encerrada ao veículo para calcular. O cálculo usa os pontos na
          ordem recebida; não comprova o percurso efetivo nem a elegibilidade
          comercial.
        </p>
        {!dados.jornadas.length && (
          <p className="text-sm text-text-500">
            Nenhuma jornada registrada para esta pessoa.
          </p>
        )}
        {dados.jornadas.map(j => (
          <article key={j.id} className="rounded-lg border border-line p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold">
                  {j.veiculo} ·{" "}
                  {j.pontos.at(-1)?.tipo === "check_out"
                    ? "Encerrada"
                    : "Aberta"}
                </h3>
                <p className="mt-1 text-xs text-text-500">
                  {dataHora(j.pontos[0]?.ocorridoEm)} · {j.pontos.length} pontos
                </p>
                <p className="mt-1 font-mono text-sm">
                  {j.calculo.metros === null
                    ? "Distância não calculada"
                    : `${(j.calculo.metros / 1000).toLocaleString("pt-BR")} km estimados`}
                </p>
                {j.calculo.estado !== "estimado" && j.calculo.proximaTentativaEm && (
                  <p className="mt-1 text-xs text-text-500">
                    Nova consulta permitida a partir de {dataHora(j.calculo.proximaTentativaEm)}.
                  </p>
                )}
              </div>
              <button
                type="button"
                className={campoButtonClass}
                disabled={
                  busy ||
                  j.pontos.at(-1)?.tipo !== "check_out" ||
                  j.calculo.estado === "estimado"
                }
                onClick={() =>
                  void operar(
                    () =>
                      calcular.mutateAsync({ colaboradorId, jornadaId: j.id }),
                    value => {
                      if (value.calculo.estado === "estimado")
                        toast.success("Estimativa de rota registrada");
                      else
                        toast.info(
                          "A jornada aguarda cálculo. As consultas respeitam o intervalo configurado pela empresa."
                        );
                    }
                  )
                }
              >
                Calcular rota
              </button>
            </div>
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-brand-500">
                Consultar pontos
              </summary>
              <ol className="mt-2 flex flex-col gap-1">
                {j.pontos.map(p => (
                  <li key={p.id} className="font-mono text-xs">
                    {rotulo(p.tipo)} · {dataHora(p.ocorridoEm)} · {p.latitude},{" "}
                    {p.longitude}
                  </li>
                ))}
              </ol>
            </details>
          </article>
        ))}
      </Bloco>
      <Bloco titulo="Documentos de combustível">
        <p className="text-sm text-text-500">
          Selecione uma nota recebida pelo WhatsApp. O servidor confirma o
          vínculo com esta pessoa e extrai os campos do arquivo; não há
          preenchimento manual de chave, litros ou CNPJ.
        </p>
        <form
          className="grid items-end gap-3 sm:grid-cols-3"
          onSubmit={event => {
            event.preventDefault();
            if (
              !notas.some(n => n.notaFiscalId === Number(notaId)) ||
              !veiculo.trim()
            )
              return;
            void operar(
              () =>
                documento.mutateAsync({
                  colaboradorId,
                  notaFiscalId: Number(notaId),
                  veiculo: veiculo.trim(),
                }),
              value => {
                if (value.duplicado)
                  toast.info(
                    "Documento já registrado. Nenhum novo documento foi criado."
                  );
                else toast.success("Documento importado para conferência");
                setNotaId("");
              }
            );
          }}
        >
          <label className="flex flex-col gap-1 text-sm">
            Nota da empresa
            <select
              required
              disabled={busy}
              className={campoInputClass}
              value={notaId}
              onChange={e => setNotaId(e.target.value)}
            >
              <option value="">Selecione uma nota</option>
              {notas.map(n => (
                <option key={n.id} value={n.notaFiscalId!}>
                  Nota #{n.notaFiscalId} · despesa #{n.id} ·{" "}
                  {n.colaborador ?? "Sem nome"}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Placa cadastrada
            <input
              required
              maxLength={10}
              disabled={busy}
              list="placas-campo"
              className={campoInputClass}
              value={veiculo}
              onChange={e => setVeiculo(e.target.value.toUpperCase())}
            />
          </label>
          <button
            className={campoButtonClass}
            disabled={busy || !notaId || !veiculo.trim()}
          >
            Importar documento
          </button>
        </form>
        <datalist id="placas-campo">
          {placas.map(p => (
            <option key={p} value={p} />
          ))}
        </datalist>
        {!dados.documentos.length && (
          <p className="text-sm text-text-500">
            Nenhum documento vinculado à conciliação desta pessoa.
          </p>
        )}
        {dados.documentos.map(d => (
          <article key={d.id} className="rounded-lg border border-line p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">
                  Nota #{d.notaFiscalId ?? "—"} · {d.veiculo}
                </h3>
                <p className="mt-1 text-sm">
                  {rotulo(d.estado)} ·{" "}
                  {d.litros === null
                    ? "Litros não extraídos"
                    : `${d.litros} litros`}
                </p>
                <p className="mt-1 text-xs text-text-500">{d.motivo}</p>
                <p className="mt-1 text-xs text-text-500">
                  Campos pendentes:{" "}
                  {d.camposPendentes?.join(", ") || "nenhum informado"}
                </p>
                <p className="mt-1 break-all font-mono text-xs">
                  Chave: {d.chave ?? "não extraída"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy || !documentoRegularizavel(d, cnpj)}
                  className={campoButtonClass}
                  onClick={() => {
                    setMotivo("");
                    setRevisao({ id: d.id, regular: true });
                  }}
                >
                  Conferir como regular
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className="rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-50"
                  onClick={() => {
                    setMotivo("");
                    setRevisao({ id: d.id, regular: false });
                  }}
                >
                  Marcar divergência
                </button>
              </div>
            </div>
          </article>
        ))}
        {revisao && docRevisao && (
          <form
            className="flex flex-col gap-3 rounded-lg border border-line bg-paper p-4"
            onSubmit={event => {
              event.preventDefault();
              if (
                motivo.trim().length < 10 ||
                (revisao.regular && !documentoRegularizavel(docRevisao, cnpj))
              )
                return;
              void operar(
                () =>
                  revisar.mutateAsync({
                    colaboradorId,
                    documentoId: revisao.id,
                    regular: revisao.regular,
                    motivo: motivo.trim(),
                  }),
                () => {
                  toast.success("Conferência documental registrada");
                  setRevisao(null);
                  setMotivo("");
                }
              );
            }}
          >
            <h3 className="font-semibold">
              Conferência da nota #{docRevisao.notaFiscalId} —{" "}
              {revisao.regular ? "regular" : "divergente"}
            </h3>
            <p className="text-xs text-text-500">
              A conferência não equivale à autenticação da nota pela SEFAZ.
            </p>
            <label className="flex flex-col gap-1 text-sm">
              Motivo da conferência (mínimo 10 caracteres)
              <textarea
                required
                minLength={10}
                maxLength={1000}
                disabled={busy}
                value={motivo}
                onChange={e => setMotivo(e.target.value)}
                className="min-h-20 rounded-lg border border-line p-3"
              />
            </label>
            <div className="flex gap-2">
              <button
                disabled={busy || motivo.trim().length < 10}
                className={campoButtonClass}
              >
                Confirmar conferência
              </button>
              <button
                type="button"
                disabled={busy}
                className="px-3 text-sm"
                onClick={() => setRevisao(null)}
              >
                Cancelar
              </button>
            </div>
          </form>
        )}
      </Bloco>
      <Bloco titulo="Conciliação por período">
        <p className="text-sm text-text-500">
          Informe início e fim no seu horário local. O fim é exclusivo. A
          conciliação documenta cobertura; não equipara litros comprados a
          consumo medido.
        </p>
        <form
          className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={event => {
            event.preventDefault();
            if (!periodo || !veiculo.trim()) return;
            void operar(
              () =>
                conciliar.mutateAsync({
                  colaboradorId,
                  ...periodo,
                  ...(ufCalculo && metrosComerciais !== ""
                    ? { ufCalculo, metrosComerciais: Number(metrosComerciais) }
                    : {}),
                  veiculo: veiculo.trim(),
                }),
              value =>
                toast.success(`Conciliação registrada: ${rotulo(value.estado)}`)
            );
          }}
        >
          <label className="flex flex-col gap-1 text-sm">
            Início
            <input
              type="datetime-local"
              required
              disabled={busy}
              className={campoInputClass}
              value={inicio}
              onChange={e => setInicio(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Fim exclusivo
            <input
              type="datetime-local"
              required
              disabled={busy}
              className={campoInputClass}
              value={fim}
              onChange={e => setFim(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Placa
            <input
              required
              maxLength={10}
              list="placas-campo"
              disabled={busy}
              className={campoInputClass}
              value={veiculo}
              onChange={e => setVeiculo(e.target.value.toUpperCase())}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            UF para reembolso
            <select
              className={campoInputClass}
              disabled={busy}
              value={ufCalculo}
              onChange={e => setUfCalculo(e.target.value as Uf | "")}
            >
              <option value="">Somente conciliação documental</option>
              {"AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO"
                .split(" ")
                .map(uf => (
                  <option key={uf}>{uf}</option>
                ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Distância comercial (metros)
            <input
              type="number"
              required={!!ufCalculo}
              min="0"
              step="1"
              className={campoInputClass}
              disabled={busy || !ufCalculo}
              value={metrosComerciais}
              onChange={e => setMetrosComerciais(e.target.value)}
            />
          </label>
          <p className="text-xs text-text-500 sm:col-span-2">
            Informe apenas a distância elegível pela política. O restante do
            trajeto permanece não comercial.
          </p>
          <button
            disabled={
              busy ||
              !periodo ||
              !veiculo.trim() ||
              (!!ufCalculo && metrosComerciais === "")
            }
            className={campoButtonClass}
          >
            Conciliar período
          </button>
        </form>
        {!dados.conciliacoes.length && (
          <p className="text-sm text-text-500">
            Nenhuma conciliação registrada.
          </p>
        )}
        {dados.conciliacoes.map(c => (
          <article
            key={`${c.veiculo}:${c.inicio}:${c.fim}`}
            className="rounded-lg border border-line p-4"
          >
            <h3 className="font-semibold">
              {c.veiculo} · {rotulo(c.estado)}
            </h3>
            <p className="mt-1 text-xs text-text-500">
              {dataHora(c.inicio)} até {dataHora(c.fim)} · versão {c.versao}
            </p>
            <p className="mt-2 font-mono text-sm">
              {c.metrosEstimados === null
                ? "Distância pendente"
                : `${(c.metrosEstimados / 1000).toLocaleString("pt-BR")} km estimados`}{" "}
              · {c.litrosDocumentados.toLocaleString("pt-BR")} L documentados
            </p>
            {c.memorialReembolso && (
              <div className="mt-3 rounded-lg bg-paper p-3 text-sm">
                <p className="font-semibold">
                  Memorial de reembolso · {c.memorialReembolso.uf}
                </p>
                <p>
                  {c.memorialReembolso.metrosComerciais.toLocaleString("pt-BR")}{" "}
                  m comerciais ·{" "}
                  {c.memorialReembolso.metrosNaoComerciais.toLocaleString(
                    "pt-BR"
                  )}{" "}
                  m não comerciais
                </p>
                <p>
                  {(
                    c.memorialReembolso.tarifaCentavosPorKm / 100
                  ).toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
                  /km · valor:{" "}
                  {(c.memorialReembolso.valorCentavos / 100).toLocaleString(
                    "pt-BR",
                    { style: "currency", currency: "BRL" }
                  )}
                </p>
                <p className="text-xs">
                  Política #{c.memorialReembolso.politicaId}, versão{" "}
                  {c.memorialReembolso.politicaVersao}
                </p>
              </div>
            )}
            <p className="mt-1 text-xs text-text-500">
              Lembrete: {c.lembrete}. {c.lembretes?.agendados ?? 0} agendados;
              agendamento não comprova entrega.
            </p>
          </article>
        ))}
      </Bloco>
      <Bloco titulo="Registro de pagamento da empresa">
        <p className="text-sm text-text-500">
          Registre um pagamento já realizado de despesa aprovada. Este
          formulário não transfere dinheiro nem executa PIX. A seleção abaixo
          abrange a empresa ativa.
        </p>
        <form
          className="grid items-end gap-3 sm:grid-cols-2"
          onSubmit={event => {
            event.preventDefault();
            const data = dataPagamentoUtc(pagoEm);
            if (!data) {
              setErro("Informe uma data de pagamento válida, sem data futura.");
              return;
            }
            if (
              !aprovadas.some(d => d.id === Number(despesaId)) ||
              referencia.trim().length < 3
            )
              return;
            setRegistroPagamento(null);
            void operar(
              () =>
                pagamento.mutateAsync({
                  despesaId: Number(despesaId),
                  referencia: referencia.trim(),
                  pagoEm: data,
                }),
              value => {
                setRegistroPagamento(
                  `Pagamento da despesa #${value.despesaId} registrado com referência ${value.referencia}. Nenhuma transferência foi executada pelo sistema.`
                );
                toast.success("Registro de pagamento confirmado");
              }
            );
          }}
        >
          <label className="flex flex-col gap-1 text-sm">
            Despesa aprovada
            <select
              required
              disabled={busy}
              className={campoInputClass}
              value={despesaId}
              onChange={e => {
                setDespesaId(e.target.value);
                setRegistroPagamento(null);
              }}
            >
              <option value="">Selecione</option>
              {aprovadas.map(d => (
                <option key={d.id} value={d.id}>
                  #{d.id} · {d.colaborador ?? "Sem nome"}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Referência do pagamento
            <input
              required
              minLength={3}
              maxLength={128}
              disabled={busy}
              className={campoInputClass}
              value={referencia}
              onChange={e => {
                setReferencia(e.target.value);
                setRegistroPagamento(null);
              }}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Pago em (horário local)
            <input
              type="datetime-local"
              required
              disabled={busy}
              className={campoInputClass}
              value={pagoEm}
              onChange={e => {
                setPagoEm(e.target.value);
                setRegistroPagamento(null);
              }}
            />
          </label>
          <button
            disabled={
              busy || !despesaId || !pagoEm || referencia.trim().length < 3
            }
            className={campoButtonClass}
          >
            Registrar pagamento realizado
          </button>
        </form>
        {registroPagamento && (
          <p role="status" className="text-sm text-brand-500">
            {registroPagamento}
          </p>
        )}
      </Bloco>
      <details className="rounded-xl border border-line bg-surface p-5">
        <summary className="cursor-pointer font-semibold">
          Trilha de alterações ({dados.auditoria.length})
        </summary>
        <ol className="mt-3 flex flex-col gap-2 text-xs text-text-500">
          {dados.auditoria
            .slice(-50)
            .reverse()
            .map((a, i) => (
              <li key={`${a.em}:${i}`}>
                {dataHora(a.em)} · {a.acao} · {a.origem} ·{" "}
                {a.usuarioId === null ? "canal" : `usuário #${a.usuarioId}`}
              </li>
            ))}
        </ol>
      </details>
    </div>
  );
}

function CampoEmpresa({
  empresaId,
  cnpj,
}: {
  empresaId: number;
  cnpj: string;
}) {
  const pessoas = trpc.colaboradores.listar.useQuery(
    { empresaId },
    { retry: false }
  );
  const [id, setId] = useState<number | null>(null);
  const pessoa = colaboradorDaEmpresa(pessoas.data ?? [], empresaId, id);
  if (pessoas.isError)
    return (
      <QueryError
        titulo="Colaboradores indisponíveis"
        onRetry={() => {
          void pessoas.refetch();
        }}
      />
    );
  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-wider text-brand-500">
            Operação de campo
          </p>
          <h1 className="mt-1 text-2xl font-semibold">Campo e conciliação</h1>
        </div>
        <button
          type="button"
          onClick={() => {
            void pessoas.refetch();
          }}
          className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm"
        >
          <RefreshCw className="h-4 w-4" />
          Atualizar equipe
        </button>
      </header>
      <details className="rounded-xl border border-line bg-surface p-5">
        <summary className="flex cursor-pointer items-center gap-2 font-semibold">
          <SlidersHorizontal className="h-4 w-4" />
          Parâmetros da política de campo
        </summary>
        <div className="mt-4">
          <ConfiguracaoCampo empresaId={empresaId} />
        </div>
      </details>
      <label className="flex max-w-md flex-col gap-1 text-sm">
        Colaborador da empresa ativa
        <select
          value={id ?? ""}
          disabled={pessoas.isLoading}
          onChange={e => setId(e.target.value ? Number(e.target.value) : null)}
          className={campoInputClass}
        >
          <option value="">
            {pessoas.isLoading ? "Carregando…" : "Selecione um colaborador"}
          </option>
          {(pessoas.data ?? [])
            .filter(p => p.empresaId === empresaId)
            .map(p => (
              <option key={p.id} value={p.id}>
                {p.nome}
                {p.statusVinculo === "ativo" ? "" : " (vínculo suspenso)"}
              </option>
            ))}
        </select>
      </label>
      {pessoa ? (
        <OperacaoCampo
          key={pessoa.id}
          empresaId={empresaId}
          colaboradorId={pessoa.id}
          cnpj={cnpj}
          ativo={pessoa.statusVinculo === "ativo"}
        />
      ) : (
        <div className="rounded-xl border border-line bg-surface p-8 text-center">
          <MapPin className="mx-auto mb-3 h-6 w-6 text-brand-500" />
          <p className="text-sm text-text-500">
            {pessoas.isLoading
              ? "Carregando equipe…"
              : pessoas.data?.length
                ? "Selecione uma pessoa para consultar jornadas, notas e conciliações."
                : "Cadastre colaboradores na equipe para iniciar a operação."}
          </p>
          <Link
            className="mt-3 inline-block text-sm text-brand-500"
            to="/app/equipe"
          >
            Abrir equipe
          </Link>
        </div>
      )}
    </div>
  );
}

export default function Campo() {
  const { activeCompany, isLoading } = useActiveCompany();
  const { user } = useAuth();
  if (isLoading) return <p role="status">Carregando empresa…</p>;
  if (!activeCompany)
    return (
      <p className="text-sm text-text-500">
        Selecione uma empresa para operar campo.
      </p>
    );
  if (!podeEditarPolitica(user, activeCompany))
    return (
      <p
        role="alert"
        className="rounded-xl border border-line bg-surface p-6 text-sm"
      >
        Somente o administrador da empresa selecionada pode operar campo e
        conciliação.
      </p>
    );
  return (
    <CampoEmpresa
      key={activeCompany.id}
      empresaId={activeCompany.id}
      cnpj={activeCompany.cnpj}
    />
  );
}

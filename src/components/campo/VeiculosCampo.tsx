import { UFS_BRASIL, type Uf } from "@contracts/empresas";
import {
  consumoVeiculo,
  orientacaoVeiculo,
  veiculoUnificadoInput,
} from "@contracts/veiculos";
import { useState } from "react";
import { trpc } from "@/providers/trpc";
import {
  campoButtonClass,
  campoInputClass,
  mensagemErroVeiculo,
} from "./formulario";

const UFS = UFS_BRASIL;

export default function VeiculosCampo({
  empresaId,
  colaboradorId,
  ativo,
}: {
  empresaId: number;
  colaboradorId: number;
  ativo: boolean;
}) {
  const utils = trpc.useUtils();
  const lista = trpc.veiculos.listar.useQuery({ empresaId }, { retry: false });
  const [placa, setPlaca] = useState("");
  const [renavam, setRenavam] = useState("");
  const [motorizacao, setMotorizacao] = useState<
    "combustao" | "hibrido" | "eletrico"
  >("combustao");
  const [uf, setUf] = useState<Uf | "">("");
  const [consumo, setConsumo] = useState("");
  const [erroValidacao, setErroValidacao] = useState<string | null>(null);
  const [confirmado, setConfirmado] = useState(false);
  const salvar = trpc.veiculos.salvar.useMutation({
    onSuccess: async () => {
      await utils.veiculos.listar.invalidate({ empresaId });
      setConfirmado(true);
      setPlaca("");
      setRenavam("");
      setConsumo("");
    },
  });
  const busy = !ativo || salvar.isPending;
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5">
      <h2 className="text-[16px] font-semibold">
        Veículos da pessoa selecionada
      </h2>
      <p className="text-sm text-text-500">
        Cadastre a identificação e o consumo declarado para a apuração de
        combustível.
      </p>
      {lista.isError ? (
        <p role="alert">
          Não foi possível consultar os veículos.{" "}
          <button type="button" onClick={() => void lista.refetch()}>
            Tentar novamente
          </button>
        </p>
      ) : lista.isLoading ? (
        <p role="status">Carregando veículos…</p>
      ) : (
        <ul className="text-sm">
          {lista.data
            ?.filter(
              v =>
                v.colaboradorId === colaboradorId && v.empresaId === empresaId
            )
            .map(v => (
              <li key={v.id}>
                {v.placa} · {v.ufLicenciamento} · {v.kmPorLitroDeclarado} km/L
              </li>
            ))}
        </ul>
      )}
      <form
        noValidate
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={event => {
          event.preventDefault();
          if (busy) return;
          setConfirmado(false);
          salvar.reset();
          const dados = veiculoUnificadoInput.safeParse({
            empresaId,
            colaboradorId,
            placa,
            renavam,
            motorizacao,
            ufLicenciamento: uf,
            kmPorLitroDeclarado: consumoVeiculo(consumo),
          });
          if (!dados.success) {
            setErroValidacao(orientacaoVeiculo(dados.error.issues));
            return;
          }
          setErroValidacao(null);
          salvar.mutate(dados.data);
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          Placa
          <input
            required
            minLength={7}
            maxLength={8}
            disabled={busy}
            className={campoInputClass}
            value={placa}
            onChange={e => setPlaca(e.target.value.toUpperCase())}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          RENAVAM
          <input
            required
            inputMode="numeric"
            pattern="[0-9]{9,11}"
            maxLength={11}
            disabled={busy}
            className={campoInputClass}
            value={renavam}
            onChange={e => setRenavam(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Motorização
          <select
            disabled={busy}
            className={campoInputClass}
            value={motorizacao}
            onChange={e => setMotorizacao(e.target.value as typeof motorizacao)}
          >
            <option value="combustao">Combustão</option>
            <option value="hibrido">Híbrido</option>
            <option value="eletrico">Elétrico</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          UF de licenciamento
          <select
            required
            disabled={busy}
            className={campoInputClass}
            value={uf}
            onChange={e => setUf(e.target.value as Uf | "")}
          >
            <option value="">Selecione</option>
            {UFS.map(item => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Consumo declarado (km/L)
          <input
            type="text"
            inputMode="decimal"
            required
            disabled={busy}
            className={campoInputClass}
            value={consumo}
            onChange={e => setConsumo(e.target.value)}
          />
        </label>
        <button className={`${campoButtonClass} self-end`} disabled={busy}>
          {salvar.isPending ? "Salvando…" : "Cadastrar veículo"}
        </button>
      </form>
      {(erroValidacao || salvar.isError) && (
        <p role="alert" className="text-sm text-conf-vedado-text">
          Cadastro não confirmado:{" "}
          {erroValidacao || mensagemErroVeiculo(salvar.error)}
        </p>
      )}
      {confirmado && (
        <p role="status" className="text-sm text-brand-500">
          Veículo cadastrado para esta pessoa.
        </p>
      )}
    </section>
  );
}

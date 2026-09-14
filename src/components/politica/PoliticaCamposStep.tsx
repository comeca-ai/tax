import {
  camposCustomizadosPoliticaSchema,
  type CampoCustomizadoPolitica,
} from "@contracts/types";

export const GRUPOS_CAMPOS = {
  cargo: "Cargos",
  funcao: "Funções",
  particularidade: "Particularidades",
} as const;
const TIPOS = {
  texto: "Texto",
  numero: "Número",
  data: "Data",
  selecao: "Seleção",
  booleano: "Sim ou não",
} as const;
const INPUT =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-text-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30";
const BOTAO =
  "rounded-lg border border-line px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50";

export function ResumoCamposCustomizados({
  campos,
}: {
  campos: CampoCustomizadoPolitica[];
}) {
  if (!campos.length) return null;
  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <h3 className="font-semibold text-text-900">
        Campos customizados da política
      </h3>
      <p className="mt-1 text-sm text-text-500">
        Campos definidos nesta versão. O preenchimento destes campos nas
        despesas ainda não está disponível.
      </p>
      <ul className="mt-3 space-y-3">
        {campos.map(campo => (
          <li key={campo.id} className="text-sm">
            <p>
              <strong>{campo.nome}</strong> · {GRUPOS_CAMPOS[campo.grupo]} ·{" "}
              {TIPOS[campo.tipo]} ·{" "}
              {campo.obrigatorio ? "Obrigatório" : "Opcional"}
            </p>
            {campo.opcoes.length > 0 && (
              <p className="text-text-500">Opções: {campo.opcoes.join(", ")}</p>
            )}
            {campo.descricao && (
              <p className="whitespace-pre-wrap text-text-500">
                {campo.descricao}
              </p>
            )}
            {campo.fonte && (
              <blockquote className="mt-1 whitespace-pre-wrap border-l-2 border-brand-500/30 pl-3 text-xs text-text-500">
                Origem: {campo.fonte}
              </blockquote>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function PoliticaCamposStep({
  campos,
  onChange,
  onVoltar,
  onSalvar,
  salvando,
  pendencias = [],
}: {
  campos: CampoCustomizadoPolitica[];
  onChange: (campos: CampoCustomizadoPolitica[]) => void;
  onVoltar: () => void;
  onSalvar: () => void;
  salvando: boolean;
  pendencias?: string[];
}) {
  const validacao = camposCustomizadosPoliticaSchema.safeParse(campos);
  function alterar(id: string, patch: Partial<CampoCustomizadoPolitica>) {
    onChange(
      campos.map(campo => (campo.id === id ? { ...campo, ...patch } : campo))
    );
  }
  function adicionar(grupo: CampoCustomizadoPolitica["grupo"]) {
    onChange([
      ...campos,
      {
        id: crypto.randomUUID(),
        grupo,
        nome: "",
        tipo: "texto",
        obrigatorio: false,
        opcoes: [],
        descricao: "",
        fonte: "",
      },
    ]);
  }
  return (
    <div className="flex flex-col gap-4">
      <header className="rounded-xl border border-line bg-surface p-5">
        <h2 className="text-lg font-semibold text-text-900">
          Revisar cargos, funções e particularidades
        </h2>
        <p className="mt-2 text-sm text-text-500">
          Confira as sugestões extraídas da política. Ajuste o nome, o tipo de
          resposta, as opções e a obrigatoriedade; remova sugestões incorretas
          ou inclua campos que faltaram.
        </p>
        <p className="mt-2 text-sm text-text-500">
          Os campos ficam vinculados a esta versão. Cargos e funções descrevem a
          política e não concedem acesso ou poder de aprovação no sistema.
        </p>
        {pendencias.length > 0 && (
          <ul
            role="status"
            className="mt-3 list-disc pl-5 text-sm text-conf-media-text"
          >
            {pendencias.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        )}
      </header>
      <fieldset disabled={salvando} className="space-y-4">
        {Object.entries(GRUPOS_CAMPOS).map(([grupo, titulo]) => (
          <section
            key={grupo}
            className="rounded-xl border border-line bg-surface p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-text-900">{titulo}</h3>
              <button
                type="button"
                className={BOTAO}
                disabled={campos.length >= 100}
                onClick={() =>
                  adicionar(grupo as CampoCustomizadoPolitica["grupo"])
                }
              >
                Adicionar campo em {titulo.toLowerCase()}
              </button>
            </div>
            {!campos.some(campo => campo.grupo === grupo) && (
              <p className="mt-3 text-sm text-text-500">
                Nenhum campo identificado neste grupo. Confira o documento e
                adicione se necessário.
              </p>
            )}
            <div className="mt-4 space-y-4">
              {campos
                .filter(campo => campo.grupo === grupo)
                .map(campo => (
                  <article
                    key={campo.id}
                    className="rounded-lg border border-line bg-paper p-4"
                  >
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="space-y-1 text-sm">
                        Nome do campo
                        <input
                          className={INPUT}
                          value={campo.nome}
                          maxLength={120}
                          onChange={e =>
                            alterar(campo.id, { nome: e.target.value })
                          }
                        />
                      </label>
                      <label className="space-y-1 text-sm">
                        Tipo de resposta
                        <select
                          className={INPUT}
                          value={campo.tipo}
                          onChange={e =>
                            alterar(campo.id, {
                              tipo: e.target
                                .value as CampoCustomizadoPolitica["tipo"],
                              opcoes:
                                e.target.value === "selecao"
                                  ? campo.opcoes
                                  : [],
                            })
                          }
                        >
                          {Object.entries(TIPOS).map(([valor, rotulo]) => (
                            <option key={valor} value={valor}>
                              {rotulo}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-1 text-sm">
                        Grupo
                        <select
                          className={INPUT}
                          value={campo.grupo}
                          onChange={e =>
                            alterar(campo.id, {
                              grupo: e.target
                                .value as CampoCustomizadoPolitica["grupo"],
                            })
                          }
                        >
                          {Object.entries(GRUPOS_CAMPOS).map(
                            ([valor, rotulo]) => (
                              <option key={valor} value={valor}>
                                {rotulo}
                              </option>
                            )
                          )}
                        </select>
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={campo.obrigatorio}
                          onChange={e =>
                            alterar(campo.id, { obrigatorio: e.target.checked })
                          }
                        />
                        Obrigatório segundo a política
                      </label>
                      {campo.tipo === "selecao" && (
                        <label className="space-y-1 text-sm sm:col-span-2">
                          Opções (uma por linha)
                          <textarea
                            className={INPUT}
                            rows={3}
                            value={campo.opcoes.join("\n")}
                            onChange={e =>
                              alterar(campo.id, {
                                opcoes: e.target.value.split("\n"),
                              })
                            }
                          />
                        </label>
                      )}
                      <label className="space-y-1 text-sm sm:col-span-2">
                        Descrição ou particularidade
                        <textarea
                          className={INPUT}
                          maxLength={1000}
                          value={campo.descricao}
                          onChange={e =>
                            alterar(campo.id, { descricao: e.target.value })
                          }
                        />
                      </label>
                    </div>
                    {campo.fonte ? (
                      <blockquote className="mt-3 whitespace-pre-wrap border-l-2 border-brand-500/30 pl-3 text-xs text-text-500">
                        Trecho de origem: {campo.fonte}
                      </blockquote>
                    ) : (
                      <p className="mt-3 text-xs text-text-500">
                        Campo incluído manualmente, sem trecho extraído.
                      </p>
                    )}
                    <button
                      type="button"
                      className={`${BOTAO} mt-3`}
                      onClick={() =>
                        onChange(campos.filter(item => item.id !== campo.id))
                      }
                    >
                      Remover campo {campo.nome}
                    </button>
                  </article>
                ))}
            </div>
          </section>
        ))}
      </fieldset>
      {!validacao.success && (
        <p role="alert" className="text-sm text-conf-media-text">
          Confira os campos antes de continuar:{" "}
          {validacao.error.issues[0]?.message}
        </p>
      )}
      <div className="flex flex-wrap justify-between gap-3">
        <button
          type="button"
          className={BOTAO}
          onClick={onVoltar}
          disabled={salvando}
        >
          ← Voltar às regras
        </button>
        <button
          type="button"
          className={`${BOTAO} bg-brand-500 text-white`}
          onClick={onSalvar}
          disabled={salvando || !validacao.success}
        >
          {salvando ? "Salvando…" : "Salvar e simular"}
        </button>
      </div>
    </div>
  );
}

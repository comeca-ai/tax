import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { campoCustomizadoPoliticaSchema } from "@contracts/types";
import PoliticaCamposStep, {
  ResumoCamposCustomizados,
} from "./PoliticaCamposStep";
import { alertasCamposCustomizados } from "./alertasCamposCustomizados";

const campo = campoCustomizadoPoliticaSchema.parse({
  id: "cargo",
  nome: "Cargo",
  grupo: "cargo",
  tipo: "selecao",
  opcoes: ["Diretor", "Analista"],
  fonte: "Seção 2: Diretor ou Analista",
});
const noop = () => {};

it("mostra origem e opções para revisão e informa ausência de sugestões nos outros grupos", () => {
  const html = renderToStaticMarkup(
    <PoliticaCamposStep
      campos={[campo]}
      onChange={noop}
      onVoltar={noop}
      onSalvar={noop}
      salvando={false}
    />
  );
  expect(html).toContain(campo.fonte);
  expect(html).toContain("Diretor\nAnalista");
  expect(html).toContain("Nenhum campo identificado neste grupo");
  expect(html).toContain("Salvar e simular");
  expect(html).not.toContain('disabled=""');
});

it("bloqueia o avanço para seleção sem opções e permite lista vazia", () => {
  const render = (campos: (typeof campo)[]) =>
    renderToStaticMarkup(
      <PoliticaCamposStep
        campos={campos}
        onChange={noop}
        onVoltar={noop}
        onSalvar={noop}
        salvando={false}
      />
    );
  expect(render([{ ...campo, opcoes: [] }])).toMatch(
    /disabled="">Salvar e simular/
  );
  expect(render([])).not.toContain('disabled=""');
});

it("resume os campos salvos com evidência sem interpretar HTML vindo do documento", () => {
  const html = renderToStaticMarkup(
    <ResumoCamposCustomizados
      campos={[{ ...campo, fonte: "<script>alert(1)</script>" }]}
    />
  );
  expect(html).toContain("Diretor, Analista");
  expect(html).toContain("Opcional");
  expect(html).toContain("&lt;script&gt;");
  expect(html).not.toContain("<script>");
});

it("expõe fallback da IA e ausência de sugestões antes da aprovação humana", () => {
  expect(
    alertasCamposCustomizados(
      {
        provedor: "heuristico-local",
        camposPendentes: [],
        avisos: [
          "OpenAI indisponível (HTTP 429): extração heurística usada como contingência.",
        ],
      },
      0
    )
  ).toEqual([
    "OpenAI indisponível (HTTP 429): extração heurística usada como contingência.",
    expect.stringContaining("Nenhum campo customizado foi sugerido"),
  ]);
});

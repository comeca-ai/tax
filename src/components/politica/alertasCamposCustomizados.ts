import type { PolicyExtracao } from "@contracts/types";

export function alertasCamposCustomizados(
  extracao: Pick<
    PolicyExtracao,
    "camposPendentes" | "avisos" | "provedor"
  > | null,
  quantidade: number
) {
  if (!extracao) return [];
  const alertas = [
    ...extracao.camposPendentes.filter(p => /campos customizados/i.test(p)),
    ...extracao.avisos.filter(aviso =>
      /openai|mistral|llm|heur[ií]stic|conting[eê]ncia|indispon[ií]vel/i.test(
        aviso
      )
    ),
  ];
  if (quantidade === 0)
    alertas.push(
      "Nenhum campo customizado foi sugerido pela extração. Confirme o documento e inclua manualmente o que for necessário antes de salvar."
    );
  return [...new Set(alertas)];
}

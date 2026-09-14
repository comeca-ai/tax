import {
  campoCustomizadoPoliticaSchema,
  type CampoCustomizadoPolitica,
} from "@contracts/types";

/** A saída do provedor é dado não confiável; itens inválidos ficam sinalizados para revisão. */
export function mapearCamposCustomizados(valor: unknown): {
  campos: CampoCustomizadoPolitica[];
  pendentes: string[];
} {
  if (valor === undefined)
    return {
      campos: [],
      pendentes: [
        "Campos customizados: extração não disponível; revise manualmente.",
      ],
    };
  if (!Array.isArray(valor))
    return {
      campos: [],
      pendentes: [
        "Campos customizados: resposta inválida; revise manualmente.",
      ],
    };
  const campos: CampoCustomizadoPolitica[] = [];
  let invalidos = Math.max(0, valor.length - 100);
  for (const [indice, item] of valor.slice(0, 100).entries()) {
    if (!item || typeof item !== "object") {
      invalidos++;
      continue;
    }
    const resultado = campoCustomizadoPoliticaSchema.safeParse({
      ...item,
      id: `campo-${indice + 1}`,
    });
    if (!resultado.success || !resultado.data.fonte) {
      invalidos++;
      continue;
    }
    campos.push(resultado.data);
  }
  return {
    campos,
    pendentes: invalidos
      ? [
          `Campos customizados: ${invalidos} sugestões inválidas ou sem trecho de origem; complete a revisão manualmente.`,
        ]
      : [],
  };
}

/** Contingência local conservadora: somente listas explicitamente rotuladas no texto. */
export function extrairCamposCustomizadosLocais(
  texto: string
): CampoCustomizadoPolitica[] {
  const campos: CampoCustomizadoPolitica[] = [];
  for (const linha of texto.split(/\r?\n/)) {
    const match = linha.match(
      /^\s*(?:[-*#]+\s*)?(cargos?|fun(?:ções|coes|ção|cao)|particularidades?)\s*:\s*(.+)/i
    );
    if (!match) continue;
    const grupo = /^cargo/i.test(match[1])
      ? "cargo"
      : /^fun/i.test(match[1])
        ? "funcao"
        : "particularidade";
    const opcoes = match[2]
      .split(/[,;|]/)
      .map(s => s.trim())
      .filter(Boolean)
      .slice(0, 80);
    const resultado = campoCustomizadoPoliticaSchema.safeParse({
      id: `campo-${campos.length + 1}`,
      grupo,
      nome:
        grupo === "cargo"
          ? "Cargo"
          : grupo === "funcao"
            ? "Função"
            : "Particularidade",
      tipo: grupo === "particularidade" ? "texto" : "selecao",
      opcoes: grupo === "particularidade" ? [] : [...new Set(opcoes)],
      descricao: match[2].slice(0, 1000),
      fonte: linha.trim().slice(0, 1000),
      obrigatorio: false,
    });
    if (resultado.success) campos.push(resultado.data);
    if (campos.length === 100) break;
  }
  return campos;
}

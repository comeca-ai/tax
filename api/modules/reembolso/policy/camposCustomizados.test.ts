import { describe, expect, it } from "vitest";
import {
  regrasPoliticaSchema,
  politicaUpdateRegrasInput,
} from "@contracts/types";
import {
  mapearCamposCustomizados,
  extrairCamposCustomizadosLocais,
} from "./camposCustomizados";
import { mapearRuleset } from "./mistral";
import { consolidarRegras } from "./derivar";
import { HeuristicPolicyParser } from "./parser";
import {
  formFromRegras,
  regrasFromForm,
} from "../../../../src/components/politica/regrasForm";

const cargo = {
  grupo: "cargo",
  nome: "Cargo",
  tipo: "selecao",
  obrigatorio: false,
  opcoes: ["Diretor", "Analista"],
  descricao: "Limites por cargo",
  fonte: "Cargos: Diretor, Analista",
};

describe("campos customizados da política", () => {
  it("preserva as definições na extração, edição, consolidação e reabertura, sem criar aprovação", () => {
    const { regras } = mapearRuleset({
      campos_customizados: [
        cargo,
        { ...cargo, grupo: "funcao", nome: "Função", opcoes: ["Aprovador"] },
        {
          ...cargo,
          grupo: "particularidade",
          nome: "Centro de custo",
          tipo: "texto",
          opcoes: [],
        },
      ],
    });
    const form = formFromRegras(regras);
    form.base.camposCustomizados[0]!.nome = "Cargo do solicitante";
    const input = politicaUpdateRegrasInput.parse({
      id: 1,
      regras: regrasFromForm(form),
    });
    const salvas = consolidarRegras(input.regras, "edicao");
    const reabertas = regrasPoliticaSchema.parse(
      JSON.parse(JSON.stringify(salvas))
    );
    expect(reabertas.camposCustomizados).toHaveLength(3);
    expect(reabertas.camposCustomizados[0]).toMatchObject({
      nome: "Cargo do solicitante",
      fonte: cargo.fonte,
      opcoes: cargo.opcoes,
    });
    expect(reabertas.aprovacaoAutomaticaAte).toBeNull();
    expect(reabertas.aprovacaoAutomaticaPorCategoria).toEqual({});
    expect(reabertas.regrasExtraidas).toEqual([]);
  });

  it("sinaliza itens inválidos ou sem fonte e aceita os demais", () => {
    const resultado = mapearCamposCustomizados([
      cargo,
      null,
      { ...cargo, tipo: "script" },
      { ...cargo, fonte: "" },
      { ...cargo, opcoes: [] },
    ]);
    expect(resultado.campos).toHaveLength(1);
    expect(resultado.pendentes[0]).toContain("4 sugestões");
    expect(mapearCamposCustomizados({}).pendentes).not.toEqual([]);
    expect(mapearCamposCustomizados(undefined).pendentes).not.toEqual([]);
    expect(mapearCamposCustomizados([]).pendentes).toEqual([]);
  });

  it("limita a resposta e gera identificadores únicos, mesmo com IDs duplicados do provedor", () => {
    const resultado = mapearCamposCustomizados(
      Array.from({ length: 101 }, () => ({ ...cargo, id: "repetido" }))
    );
    expect(resultado.campos).toHaveLength(100);
    expect(new Set(resultado.campos.map(c => c.id)).size).toBe(100);
    expect(resultado.pendentes).not.toEqual([]);
  });

  it("política antiga continua legível e a API rejeita seleção vazia e IDs duplicados", () => {
    expect(regrasPoliticaSchema.parse({}).camposCustomizados).toEqual([]);
    const campo = { ...cargo, id: "cargo" };
    expect(
      regrasPoliticaSchema.safeParse({
        camposCustomizados: [{ ...campo, opcoes: [] }],
      }).success
    ).toBe(false);
    expect(
      regrasPoliticaSchema.safeParse({ camposCustomizados: [campo, campo] })
        .success
    ).toBe(false);
  });

  it("remoção total persiste e não repõe sugestões na consolidação", () => {
    const { regras } = mapearRuleset({ campos_customizados: [cargo] });
    const form = formFromRegras(regras);
    form.base = { ...form.base, camposCustomizados: [] };
    expect(
      consolidarRegras(regrasFromForm(form), "edicao").camposCustomizados
    ).toEqual([]);
  });

  it("contingência local extrai listas explícitas sem inventar campos para texto genérico", async () => {
    const texto =
      "Cargos: Diretor, Analista\nFunções: Solicitante; Aprovador\nParticularidades: Viagem internacional\nAlimentação até R$ 100";
    expect(extrairCamposCustomizadosLocais(texto).map(c => c.grupo)).toEqual([
      "cargo",
      "funcao",
      "particularidade",
    ]);
    expect(
      extrairCamposCustomizadosLocais("O gerente aprova as despesas.")
    ).toEqual([]);
    const resultado = await new HeuristicPolicyParser().extract({
      arquivoNome: "politica.txt",
      mimeType: "text/plain",
      base64: Buffer.from(texto).toString("base64"),
    });
    expect(resultado.regras.camposCustomizados).toHaveLength(3);
    expect(resultado.camposPendentes.join(" ")).toContain(
      "somente listas explícitas"
    );
  });
});

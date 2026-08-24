import { describe, expect, it } from "vitest";
import {
  CATEGORIA_DESPESA_ROTULO as ROTULO,
  regrasPoliticaSchema,
  type RegrasPolitica,
} from "@contracts/types";
import { consolidarRegras } from "../policy/derivar";
import { REGRAS_POLITICA_13 } from "../policy/politica13.fixture";
import { confiancaDaNota, decidirReembolso, type ExtracaoNota } from "./index";

const regras: RegrasPolitica = {
  limitesPorCategoria: { alimentacao: 55 },
  tetosTemporaisPorCategoria: {},
  limitesCitados: [],
  categoriasVedadas: [],
  categoriasExcecao: [],
  aprovacaoAutomaticaAte: 55,
  aprovacaoAutomaticaAteRegraId: null,
  aprovacaoAutomaticaPorCategoria: {},
  aprovacaoCitadaPorCategoria: [],
  revisaoHumanaAcimaDe: 55,
  revisaoHumanaAcimaDeRegraId: null,
  negacaoAcimaDe: 500,
  negacaoAcimaDeRegraId: null,
  exigeVeiculoCadastrado: [],
  exigeEvidencia: [],
  exigeDocumentoFiscal: true,
  regraDocumentoFiscalId: "comprovantes-nao-aceitos",
  exigeDocumentoFiscalPorCategoria: [],
  lacunas: [],
  observacoes: [],
  regrasExtraidas: [
    {
      id: "comprovantes-nao-aceitos",
      tema: "governanca-do-processo",
      categoria: null,
      escopo: "item",
      descricao: "Comprovantes de pagamento (Pix, cartão, extrato) não são aceitos",
      condicao: "apresentar nota fiscal ou recibo do prestador",
      reembolsavel: "vedado",
      valorLimite: null,
      moeda: "BRL",
      unidadeLimite: null,
      exigeComprovante: false,
      exigeDocumentoFiscal: true,
      decisaoAutomatica: "nenhuma",
    },
  ],
};

/** Política sem a regra de documento fiscal — comportamento pré-v1.8. */
const regrasSemExigencia: RegrasPolitica = {
  ...regras,
  exigeDocumentoFiscal: false,
  regraDocumentoFiscalId: null,
  regrasExtraidas: [],
};

const base: ExtracaoNota = {
  categoriaSugerida: "alimentacao",
  valor: 42,
  dataFatoGerador: "2026-08-10",
  cnpjEmitente: "13.759.045/0002-77",
  confiancaExtracao: "alta",
  camposPendentes: [],
};

describe("decidirReembolso (D-013/D-014)", () => {
  it("aprova com regra explícita quando dentro da política", () => {
    const r = decidirReembolso(base, regras, { temVeiculo: false });
    expect(r.decisao).toBe("aprovado");
    expect(r.categoria).toBe("alimentacao");
    expect(r.motivos[0]).toContain("Dentro da política");
    expect(r.ressalvas).toEqual([]);
    expect(r.confianca).toBe("alta");
  });

  it("nega citando a regra quando acima do teto de negação", () => {
    const r = decidirReembolso({ ...base, valor: 600 }, regras, { temVeiculo: false });
    expect(r.decisao).toBe("negado");
    expect(r.motivos.join(" ")).toContain("teto");
  });

  it("devolve para revisão quando acima do limite da categoria", () => {
    const r = decidirReembolso({ ...base, valor: 70 }, regras, { temVeiculo: false });
    expect(r.decisao).toBe("revisao_manual");
  });

  it("muito acima do limite da categoria também é revisão (cupom R$ 90,14 com limite R$ 55)", () => {
    // Antes da v1.8 a tolerância de 1,5× negava — número que a política nunca escreveu (D-013).
    const r = decidirReembolso({ ...base, valor: 90.14 }, regras, { temVeiculo: false });
    expect(r.decisao).toBe("revisao_manual");
    expect(r.motivos.join(" ")).not.toContain("1,5");
  });

  it("sem política ativa, NUNCA aprova — vai para revisão manual", () => {
    const r = decidirReembolso(base, null, { temVeiculo: false });
    expect(r.decisao).toBe("revisao_manual");
    expect(r.motivos[0]).toContain("sem política");
  });

  it("sem valor extraído → revisão manual (ninguém preenche nada)", () => {
    const r = decidirReembolso({ ...base, valor: null }, regras, { temVeiculo: false });
    expect(r.decisao).toBe("revisao_manual");
    expect(r.motivos[0]).toContain("valor total");
  });

  it("sem data → revisão manual", () => {
    const r = decidirReembolso({ ...base, dataFatoGerador: null }, regras, { temVeiculo: false });
    expect(r.decisao).toBe("revisao_manual");
  });

  it("sem CNPJ do emitente NÃO bloqueia: decide normalmente, com ressalva e confiança média", () => {
    const r = decidirReembolso({ ...base, cnpjEmitente: null }, regras, { temVeiculo: false });
    expect(r.decisao).toBe("aprovado");
    expect(r.motivos.join(" ")).not.toContain("CNPJ");
    expect(r.ressalvas[0]).toContain("CNPJ");
    expect(r.confianca).toBe("media");
  });

  it("categoria indeterminada → revisão manual, categoria null", () => {
    const r = decidirReembolso({ ...base, categoriaSugerida: null }, regras, { temVeiculo: false });
    expect(r.decisao).toBe("revisao_manual");
    expect(r.categoria).toBeNull();
  });

  it("hotel de R$ 691,17 na política 13: revisão humana citando a regra, não negação por limite", () => {
    const politica13 = consolidarRegras(
      regrasPoliticaSchema.parse({ regrasExtraidas: REGRAS_POLITICA_13 }),
    );
    const r = decidirReembolso(
      {
        ...base,
        categoriaSugerida: "hospedagem",
        valor: 691.17,
        dataFatoGerador: "2026-08-19",
        cnpjEmitente: null,
      },
      politica13,
      { temVeiculo: false },
    );
    expect(r.decisao).toBe("revisao_manual");
    // A política real não declara NADA que o agente possa aprovar sozinho — é essa
    // ausência que a revisão nomeia. As 6 regras vedadas de sub-item de hospedagem
    // deixaram de travar a categoria (B-3, v1.8).
    expect(r.motivos.join(" ")).toContain("não declara nenhuma regra que autorize");
    expect(r.motivos.join(" ")).not.toContain("regra vedada e regra permissiva");
    expect(r.motivos.join(" ")).not.toContain("CNPJ");
    expect(r.motivos.join(" ")).not.toContain(`limite de ${ROTULO.hospedagem}`);
    expect(r.motivos.join(" ")).not.toContain("1,5");
    expect(r.confianca).toBe("media");
  });

  it("regra vedada SEM marcação do gestor não nega: revisão nomeando a lacuna", () => {
    const soVedado = consolidarRegras(
      regrasPoliticaSchema.parse({
        regrasExtraidas: [
          {
            id: "gorjetas-motoristas-aplicativo",
            tema: "transporte-e-deslocamento",
            categoria: "uber",
            descricao: "Gorjetas para motoristas de aplicativos de mobilidade urbana",
            reembolsavel: "vedado",
          },
        ],
      }),
    );
    const r = decidirReembolso(
      { ...base, categoriaSugerida: "uber", valor: 32 },
      soVedado,
      { temVeiculo: false },
    );
    expect(r.decisao).toBe("revisao_manual");
    expect(r.motivos.join(" ")).toContain(`só tem 1 regra vedada para ${ROTULO.uber}`);
    expect(r.motivos.join(" ")).not.toContain("negado");
  });

  it("a MESMA regra marcada 'negar' com escopo categoria → negado citando a regra", () => {
    const vedadaMarcada = consolidarRegras(
      regrasPoliticaSchema.parse({
        regrasExtraidas: [
          {
            id: "gorjetas-motoristas-aplicativo",
            tema: "transporte-e-deslocamento",
            categoria: "uber",
            escopo: "categoria",
            descricao: "Gorjetas para motoristas de aplicativos de mobilidade urbana",
            reembolsavel: "vedado",
            decisaoAutomatica: "negar",
          },
        ],
      }),
    );
    const r = decidirReembolso(
      { ...base, categoriaSugerida: "uber", valor: 32 },
      vedadaMarcada,
      { temVeiculo: false },
    );
    expect(r.decisao).toBe("negado");
    expect(r.motivos.join(" ")).toContain(
      "Gorjetas para motoristas de aplicativos de mobilidade urbana",
    );
  });

  it("teto de categoria promovido pelo gestor + aprovação automática: aprova com ressalva de CNPJ", () => {
    const comTeto = consolidarRegras(
      regrasPoliticaSchema.parse({
        regrasExtraidas: [
          {
            id: "diaria-de-hotel",
            tema: "hospedagem-e-viagem",
            categoria: "hospedagem",
            escopo: "categoria",
            descricao: "Diária de hotel em viagem nacional",
            reembolsavel: "sim",
            valorLimite: 800,
            unidadeLimite: "dia",
          },
          {
            id: "aprovacao-automatica",
            tema: "governanca-do-processo",
            descricao: "Aprovação automática até o valor de alçada do gestor",
            reembolsavel: "sim",
            valorLimite: 1000,
            // Sem esta marcação o texto "aprovação automática" não autoriza nada (v1.8).
            decisaoAutomatica: "aprovar",
          },
        ],
      }),
    );
    const r = decidirReembolso(
      {
        ...base,
        categoriaSugerida: "hospedagem",
        valor: 691.17,
        dataFatoGerador: "2026-08-19",
        cnpjEmitente: null,
      },
      comTeto,
      { temVeiculo: false },
    );
    expect(r.decisao).toBe("aprovado");
    expect(r.ressalvas[0]).toContain("CNPJ");
    expect(r.confianca).toBe("media");
  });

  it("nega extrato de conta com confiança alta ANTES da checagem de dados faltantes, citando a regra e a versão", () => {
    const r = decidirReembolso(
      {
        ...base,
        valor: null,
        cnpjEmitente: null,
        confiancaExtracao: "baixa",
        tipoDocumento: "extrato_conta",
        confiancaTipo: "alta",
      },
      regras,
      { temVeiculo: false, politicaVersao: 2 },
    );
    expect(r.decisao).toBe("negado");
    const texto = r.motivos.join(" ");
    // O motivo cita a DESCRIÇÃO da regra; o id fica só na trilha de máquina.
    expect(texto).toContain("Comprovantes de pagamento (Pix, cartão, extrato) não são aceitos");
    expect(texto).not.toContain("comprovantes-nao-aceitos");
    expect(texto).toContain("(v2)");
    expect(texto).toContain("apresentar nota fiscal ou recibo do prestador");
    expect(texto).toContain("reenvie a despesa");
    expect(r.regrasAplicadas[0]).toMatchObject({
      regra: "comprovantes-nao-aceitos",
      resultado: "falhou",
    });
    expect(r.ressalvas[0]).toContain("CNPJ");
    expect(r.confianca).toBe("baixa");
  });

  it("extrato de conta com confiança media NÃO nega — revisão do gestor (D-013)", () => {
    const r = decidirReembolso(
      { ...base, tipoDocumento: "extrato_conta", confiancaTipo: "media" },
      regras,
      { temVeiculo: false },
    );
    expect(r.decisao).toBe("revisao_manual");
    expect(r.motivos[0]).toContain("parece ser extrato de conta");
    expect(r.regrasAplicadas[0]?.resultado).toBe("revisar");
    expect(r.ressalvas).toEqual([]);
    expect(r.confianca).toBe("alta");
  });

  it("tipoDocumento ausente com dados faltantes segue o passo 1 (comportamento atual)", () => {
    const r = decidirReembolso(
      { ...base, valor: null, cnpjEmitente: null },
      regras,
      { temVeiculo: false },
    );
    expect(r.decisao).toBe("revisao_manual");
    expect(r.motivos[0]).toContain("Não foi possível extrair");
    expect(r.motivos[0]).not.toContain("CNPJ");
  });

  it("nota_fiscal com dados completos segue o fluxo de limites e aprova", () => {
    const r = decidirReembolso(
      { ...base, tipoDocumento: "nota_fiscal", confiancaTipo: "alta" },
      regras,
      { temVeiculo: false },
    );
    expect(r.decisao).toBe("aprovado");
  });

  it("política sem exigência de documento fiscal não nega por tipo", () => {
    const r = decidirReembolso(
      { ...base, tipoDocumento: "extrato_conta", confiancaTipo: "alta" },
      regrasSemExigencia,
      { temVeiculo: false },
    );
    expect(r.decisao).toBe("aprovado");
  });

  it("documento classificado como 'outro' NÃO é mais tratado como não fiscal (NFC-e de maquininha)", () => {
    const r = decidirReembolso(
      { ...base, tipoDocumento: "outro", confiancaTipo: "alta" },
      regras,
      { temVeiculo: false },
    );
    expect(r.decisao).not.toBe("negado");
    expect(r.decisao).toBe("aprovado");
  });

  it("I-1: exigência de nota fiscal de UMA categoria não alcança as outras", () => {
    const soHospedagem = consolidarRegras(
      regrasPoliticaSchema.parse({
        regrasExtraidas: [
          {
            id: "nf-hospedagem",
            tema: "hospedagem-e-viagem",
            categoria: "hospedagem",
            descricao: "Hospedagem só é reembolsada com nota fiscal do hotel",
            reembolsavel: "sim",
            escopo: "categoria",
            valorLimite: 400,
            exigeDocumentoFiscal: true,
            decisaoAutomatica: "aprovar",
          },
        ],
      }),
    );
    const extrato = { tipoDocumento: "extrato_conta" as const, confiancaTipo: "alta" as const };

    const alimentacao = decidirReembolso({ ...base, ...extrato }, soHospedagem, {
      temVeiculo: false,
    });
    expect(alimentacao.decisao).not.toBe("negado");
    expect(alimentacao.motivos.join(" ")).not.toContain("Hospedagem só é reembolsada");

    const hospedagem = decidirReembolso(
      { ...base, ...extrato, categoriaSugerida: "hospedagem", valor: 300 },
      soHospedagem,
      { temVeiculo: false },
    );
    expect(hospedagem.decisao).toBe("negado");
    expect(hospedagem.motivos.join(" ")).toContain("Hospedagem só é reembolsada com nota fiscal");
  });

  it("tipo sem lastro fiscal e política silenciosa: vira ressalva e não bloqueia", () => {
    const r = decidirReembolso(
      { ...base, tipoDocumento: "extrato_conta", confiancaTipo: "alta" },
      regrasSemExigencia,
      { temVeiculo: false },
    );
    expect(r.decisao).toBe("aprovado");
    expect(r.ressalvas.join(" ")).toContain(
      "sua política não declara se esse tipo de comprovante é aceito",
    );
    expect(r.confianca).toBe("media");
  });

  it("todas as saídas devolvem ressalvas e confianca — inclusive a de 'sem política ativa'", () => {
    const semCnpj = { ...base, cnpjEmitente: null };
    const saidas = [
      decidirReembolso(semCnpj, null, { temVeiculo: false }),
      decidirReembolso({ ...semCnpj, tipoDocumento: "extrato_conta", confiancaTipo: "alta" }, regras, { temVeiculo: false }),
      decidirReembolso({ ...semCnpj, tipoDocumento: "outro", confiancaTipo: "baixa" }, regras, { temVeiculo: false }),
      decidirReembolso({ ...semCnpj, valor: null }, regras, { temVeiculo: false }),
      decidirReembolso({ ...semCnpj, categoriaSugerida: null }, regras, { temVeiculo: false }),
      decidirReembolso(semCnpj, regras, { temVeiculo: false }),
      decidirReembolso({ ...semCnpj, valor: 600 }, regras, { temVeiculo: false }),
      decidirReembolso({ ...semCnpj, valor: 70 }, regras, { temVeiculo: false }),
    ];
    for (const r of saidas) {
      expect(r.ressalvas).toHaveLength(1);
      expect(r.ressalvas[0]).toContain("CNPJ");
      expect(r.confianca).toBe("media");
    }
  });

  it("combustível sem veículo cadastrado → revisão manual (regra da política)", () => {
    const regrasComb: RegrasPolitica = {
      ...regras,
      limitesPorCategoria: { combustivel: 300 },
      aprovacaoAutomaticaAte: 300,
      revisaoHumanaAcimaDe: 300,
      exigeVeiculoCadastrado: ["combustivel"],
    };
    const r = decidirReembolso(
      { ...base, categoriaSugerida: "combustivel", valor: 100 },
      regrasComb,
      { temVeiculo: false },
    );
    expect(r.decisao).toBe("revisao_manual");
  });
});

describe("confiancaDaNota", () => {
  it("sem valor (ou valor ≤ 0) → baixa", () => {
    expect(confiancaDaNota({ valor: null, dataFatoGerador: "2026-08-19", categoriaSugerida: "uber" })).toBe("baixa");
    expect(confiancaDaNota({ valor: 0, dataFatoGerador: "2026-08-19", categoriaSugerida: "uber" })).toBe("baixa");
  });

  it("com valor mas sem data ou sem categoria → media", () => {
    expect(confiancaDaNota({ valor: 42, dataFatoGerador: null, categoriaSugerida: "uber" })).toBe("media");
    expect(confiancaDaNota({ valor: 42, dataFatoGerador: "2026-08-19", categoriaSugerida: null })).toBe("media");
  });

  it("valor + data + categoria → alta (o CNPJ não entra na conta)", () => {
    expect(confiancaDaNota({ valor: 42, dataFatoGerador: "2026-08-19", categoriaSugerida: "uber" })).toBe("alta");
  });
});

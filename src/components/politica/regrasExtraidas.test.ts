import { describe, expect, it } from "vitest"
import { TEMAS_POLITICA, regrasPoliticaSchema, type RegraExtraida } from "@contracts/types"
import { formatBRL } from "@/lib/format"
import {
  AVISO_TETO_TEMPORAL,
  DICA_APROVACAO_AUTOMATICA,
  DICA_APROVACAO_ESCOPO,
  DICA_APROVACAO_MOEDA,
  DICA_NEGACAO_AUTOMATICA,
  DICA_NEGACAO_COM_VALOR,
  DICA_NEGACAO_ESCOPO,
  DICA_NEGACAO_VALOR_GERAL,
  adicionarRegra,
  agruparPorTema,
  contarRegras,
  estadoDecisaoAutomatica,
  estadoEscopo,
  editarRegra,
  formatarLimite,
  gerarId,
  novaRegra,
  plural,
  rebaixarDecisaoAutomatica,
  removerRegra,
  semAutorizacaoDeAprovacao,
  resumoGrupo,
  resumoValor,
} from "./regrasExtraidas"

function regra(id: string, tema: RegraExtraida["tema"], extra: Partial<RegraExtraida> = {}): RegraExtraida {
  return { ...novaRegra(tema, `Regra ${id}`), id, ...extra }
}

const LISTA = [
  regra("a1", "alimentacao"),
  regra("a2", "alimentacao"),
  regra("g1", "governanca-do-processo"),
]

describe("agruparPorTema", () => {
  it("sempre devolve os 9 temas na ordem, mesmo vazios", () => {
    const grupos = agruparPorTema(LISTA)
    expect(grupos.map((g) => g.tema)).toEqual(TEMAS_POLITICA.map(([slug]) => slug))
    expect(grupos[0].titulo).toBe("Alimentação")
    expect(grupos[0].itens.map((r) => r.id)).toEqual(["a1", "a2"])
    expect(grupos[8].itens.map((r) => r.id)).toEqual(["g1"])
    expect(grupos[3].itens).toEqual([])
    expect(agruparPorTema([])).toHaveLength(9)
  })
})

describe("novaRegra / gerarId", () => {
  it("defaults da regra manual", () => {
    const r = novaRegra("saude", "Plano odontológico")
    expect(r).toMatchObject({
      tema: "saude",
      descricao: "Plano odontológico",
      categoria: null,
      escopo: "item",
      condicao: null,
      reembolsavel: "sim",
      valorLimite: null,
      moeda: "BRL",
      unidadeLimite: null,
      exigeComprovante: false,
    })
    expect(r.id).toMatch(/^manual-[a-z0-9]+-[a-z0-9]{4}$/)
  })

  it("gerarId tem prefixo manual, timestamp base36 e 4 caracteres aleatórios", () => {
    expect(gerarId()).toMatch(/^manual-[a-z0-9]+-[a-z0-9]{4}$/)
  })
})

describe("editarRegra", () => {
  it("aplica o patch sem mutar a lista original nem o id", () => {
    const saida = editarRegra(LISTA, "a2", { descricao: "Jantar", valorLimite: 120 })
    expect(saida).not.toBe(LISTA)
    expect(saida[1]).toMatchObject({ id: "a2", descricao: "Jantar", valorLimite: 120 })
    expect(LISTA[1].descricao).toBe("Regra a2")
    expect(saida[0]).toBe(LISTA[0])
  })

  it("id inexistente devolve a mesma lista", () => {
    expect(editarRegra(LISTA, "zzz", { descricao: "x" })).toBe(LISTA)
  })
})

describe("removerRegra", () => {
  it("remove por id e preserva a ordem", () => {
    expect(removerRegra(LISTA, "a1").map((r) => r.id)).toEqual(["a2", "g1"])
    expect(removerRegra(LISTA, "nao-existe")).toHaveLength(3)
  })
})

describe("adicionarRegra", () => {
  it("insere após a última do mesmo tema", () => {
    const saida = adicionarRegra(LISTA, regra("a3", "alimentacao"))
    expect(saida.map((r) => r.id)).toEqual(["a1", "a2", "a3", "g1"])
  })

  it("tema inédito vai para o fim", () => {
    const saida = adicionarRegra(LISTA, regra("s1", "saude"))
    expect(saida.map((r) => r.id)).toEqual(["a1", "a2", "g1", "s1"])
    expect(adicionarRegra([], regra("s1", "saude")).map((r) => r.id)).toEqual(["s1"])
  })
})

describe("resumoValor", () => {
  it("BRL com unidade", () => {
    const r = regra("x", "alimentacao", { valorLimite: 80, unidadeLimite: "dia" })
    expect(resumoValor(r)).toBe(`até ${formatBRL(80)}/dia`)
    expect(resumoValor(r)).toMatch(/80,00\/dia$/)
  })

  it("moeda estrangeira sem formatação pt-BR; unidade dias_* omitida", () => {
    expect(resumoValor(regra("x", "alimentacao", { valorLimite: 50, moeda: "USD" }))).toBe("até USD 50")
    expect(
      resumoValor(regra("x", "governanca-do-processo", { valorLimite: 30, unidadeLimite: "dias_para_pagamento" })),
    ).toBe(`até ${formatBRL(30)}`)
  })

  it("sem valor devolve null", () => {
    expect(resumoValor(regra("x", "alimentacao"))).toBeNull()
  })
})

describe("plural", () => {
  it("singular, plural padrão e plural informado", () => {
    expect(plural(1, "regra")).toBe("1 regra")
    expect(plural(2, "regra")).toBe("2 regras")
    expect(plural(0, "exceção", "exceções")).toBe("0 exceções")
    expect(plural(1, "exceção", "exceções")).toBe("1 exceção")
  })
})

describe("contarRegras", () => {
  it("lista vazia zera tudo", () => {
    expect(contarRegras([])).toEqual({ total: 0, sim: 0, excecao: 0, vedado: 0, temas: 0 })
  })

  it("conta por reembolsavel e temas distintos", () => {
    const lista = [
      regra("a1", "alimentacao"),
      regra("a2", "alimentacao", { reembolsavel: "vedado" }),
      regra("g1", "governanca-do-processo", { reembolsavel: "excecao" }),
    ]
    expect(contarRegras(lista)).toEqual({ total: 3, sim: 1, excecao: 1, vedado: 1, temas: 2 })
  })

  it("regras do mesmo tema contam 1 tema", () => {
    expect(contarRegras([regra("a1", "alimentacao"), regra("a2", "alimentacao")]).temas).toBe(1)
  })
})

describe("resumoGrupo", () => {
  it("só sim mostra apenas o total", () => {
    expect(resumoGrupo([regra("1", "saude"), regra("2", "saude"), regra("3", "saude")])).toBe("3 regras")
  })

  it("singular de vedada", () => {
    expect(resumoGrupo([regra("1", "saude", { reembolsavel: "vedado" })])).toBe("1 regra · 1 vedada")
  })

  it("mistura na ordem total, vedadas, exceções", () => {
    const lista = [
      regra("1", "saude"),
      regra("2", "saude", { reembolsavel: "vedado" }),
      regra("3", "saude", { reembolsavel: "vedado" }),
      regra("4", "saude", { reembolsavel: "excecao" }),
    ]
    expect(resumoGrupo(lista)).toBe("4 regras · 2 vedadas · 1 exceção")
  })
})

describe("formatarLimite", () => {
  it("BRL com unidade por extenso", () => {
    expect(formatarLimite(regra("x", "alimentacao", { valorLimite: 80, unidadeLimite: "dia" }))).toBe(
      `até ${formatBRL(80)} por dia`,
    )
    expect(formatarLimite(regra("x", "saude", { valorLimite: 1200, unidadeLimite: "mes" }))).toMatch(/por mês$/)
  })

  it("BRL sem unidade", () => {
    expect(formatarLimite(regra("x", "alimentacao", { valorLimite: 500 }))).toBe(`até ${formatBRL(500)}`)
  })

  it("moeda estrangeira com código ISO e número sem formatação", () => {
    expect(
      formatarLimite(regra("x", "hospedagem-e-viagem", { valorLimite: 80, moeda: "USD", unidadeLimite: "viagem" })),
    ).toBe("até USD 80 por viagem")
  })

  it("percentual nunca mostra moeda", () => {
    const saida = formatarLimite(regra("x", "saude", { valorLimite: 10, moeda: "USD", unidadeLimite: "percentual" }))
    expect(saida).toBe("10%")
    expect(saida).not.toContain("R$")
    expect(saida).not.toContain("USD")
  })

  it("dias_* sem 'até' e sem moeda", () => {
    expect(
      formatarLimite(regra("x", "governanca-do-processo", { valorLimite: 30, unidadeLimite: "dias_para_pagamento" })),
    ).toBe("30 dias para pagamento")
    expect(
      formatarLimite(regra("x", "governanca-do-processo", { valorLimite: 7, unidadeLimite: "dias_antecedencia" })),
    ).toBe("7 dias de antecedência")
  })

  it("sem valor devolve null", () => {
    expect(formatarLimite(regra("x", "alimentacao"))).toBeNull()
  })

  it("resumoValor do passo 2 não muda", () => {
    expect(resumoValor(regra("x", "alimentacao", { valorLimite: 80, unidadeLimite: "dia" }))).toBe(
      `até ${formatBRL(80)}/dia`,
    )
  })
})

describe("estadoEscopo", () => {
  it("sem categoria: desabilitado, desmarcado e com dica visível", () => {
    const e = estadoEscopo(regra("x", "hospedagem-e-viagem"), "")
    expect(e.habilitado).toBe(false)
    expect(e.marcado).toBe(false)
    expect(e.dica).toBe("Escolha uma categoria para aplicar a regra à categoria inteira.")
    expect(e.aviso).toBeNull()
  })

  it("com categoria e escopo item: habilitado, desmarcado, sem dica", () => {
    const e = estadoEscopo(regra("x", "hospedagem-e-viagem", { categoria: "hospedagem" }), "400,00")
    expect(e.habilitado).toBe(true)
    expect(e.marcado).toBe(false)
    expect(e.dica).toBeNull()
    expect(e.aviso).toBeNull()
  })

  it("marcado com unidade 'dia' e valor > 0 mostra o aviso de teto temporal", () => {
    const e = estadoEscopo(
      regra("x", "hospedagem-e-viagem", { categoria: "hospedagem", escopo: "categoria", unidadeLimite: "dia" }),
      "400,00",
    )
    expect(e.marcado).toBe(true)
    expect(e.aviso).toBe(AVISO_TETO_TEMPORAL)
  })

  it("marcado sem unidade, ou com valor vazio, não mostra aviso", () => {
    const semUnidade = estadoEscopo(
      regra("x", "hospedagem-e-viagem", { categoria: "hospedagem", escopo: "categoria" }),
      "400,00",
    )
    expect(semUnidade.aviso).toBeNull()
    const semValor = estadoEscopo(
      regra("x", "hospedagem-e-viagem", { categoria: "hospedagem", escopo: "categoria", unidadeLimite: "dia" }),
      "",
    )
    expect(semValor.aviso).toBeNull()
  })

  it("unidade 'mes' não é teto por período — sem aviso", () => {
    const e = estadoEscopo(
      regra("x", "hospedagem-e-viagem", { categoria: "hospedagem", escopo: "categoria", unidadeLimite: "mes" }),
      "400,00",
    )
    expect(e.marcado).toBe(true)
    expect(e.aviso).toBeNull()
  })
})

describe("estadoDecisaoAutomatica", () => {
  const base = regra("x", "governanca-do-processo")

  it("regra nova nasce sem autorizar nada", () => {
    expect(novaRegra("alimentacao", "Almoço").decisaoAutomatica).toBe("nenhuma")
    expect(novaRegra("alimentacao", "Almoço").exigeDocumentoFiscal).toBe(false)
  })

  it("aprovar só com reembolsável + valor em reais", () => {
    const comValor = estadoDecisaoAutomatica(base, "500,00")
    expect(comValor.aprovar.habilitada).toBe(true)
    expect(comValor.aprovar.dica).toBeNull()

    const semValor = estadoDecisaoAutomatica(base, "")
    expect(semValor.aprovar.habilitada).toBe(false)
    expect(semValor.aprovar.dica).toBe(DICA_APROVACAO_AUTOMATICA)

    const percentual = estadoDecisaoAutomatica(
      { ...base, unidadeLimite: "percentual" },
      "50,00",
    )
    expect(percentual.aprovar.habilitada).toBe(false)

    const prazo = estadoDecisaoAutomatica({ ...base, unidadeLimite: "dias_para_pagamento" }, "30")
    expect(prazo.aprovar.habilitada).toBe(false)
  })

  it("B-6: moeda estrangeira não habilita aprovar — o servidor só deriva teto em reais", () => {
    const e = estadoDecisaoAutomatica({ ...base, moeda: "USD" }, "200,00")
    expect(e.aprovar.habilitada).toBe(false)
    expect(e.aprovar.dica).toBe(DICA_APROVACAO_MOEDA)
  })

  it("B-4: regra com categoria só aprova sozinha depois de promovida à categoria inteira", () => {
    const subItem = estadoDecisaoAutomatica({ ...base, categoria: "alimentacao" }, "70,00")
    expect(subItem.aprovar.habilitada).toBe(false)
    expect(subItem.aprovar.dica).toBe(DICA_APROVACAO_ESCOPO)

    const promovida = estadoDecisaoAutomatica(
      { ...base, categoria: "alimentacao", escopo: "categoria" },
      "70,00",
    )
    expect(promovida.aprovar.habilitada).toBe(true)
  })

  it("negar só com regra vedada", () => {
    const reembolsavel = estadoDecisaoAutomatica(base, "500,00")
    expect(reembolsavel.negar.habilitada).toBe(false)
    expect(reembolsavel.negar.dica).toBe(DICA_NEGACAO_AUTOMATICA)
  })

  it("B-2: sem categoria, negar é teto GERAL — exige valor e o rótulo declara o alcance", () => {
    const vedada = { ...base, reembolsavel: "vedado" as const }
    const semValor = estadoDecisaoAutomatica(vedada, "")
    expect(semValor.negar.habilitada).toBe(false)
    expect(semValor.negar.dica).toBe(DICA_NEGACAO_VALOR_GERAL)

    const comValor = estadoDecisaoAutomatica(vedada, "5.000,00")
    expect(comValor.negar.habilitada).toBe(true)
    expect(comValor.negar.rotulo).toBe("O agente pode negar qualquer despesa acima deste valor")
  })

  it("B-1: regra vedada COM valor não pode negar sozinha; sem valor e promovida, pode", () => {
    const vedadaDaCategoria = {
      ...base,
      categoria: "hospedagem" as const,
      escopo: "categoria" as const,
      reembolsavel: "vedado" as const,
    }
    const comValor = estadoDecisaoAutomatica(vedadaDaCategoria, "800,00")
    expect(comValor.negar.habilitada).toBe(false)
    expect(comValor.negar.dica).toBe(DICA_NEGACAO_COM_VALOR)

    const semValor = estadoDecisaoAutomatica(vedadaDaCategoria, "")
    expect(semValor.negar.habilitada).toBe(true)
    expect(semValor.negar.rotulo).toBe("O agente pode negar sozinho todas as despesas de Hospedagem")

    const subItem = estadoDecisaoAutomatica({ ...vedadaDaCategoria, escopo: "item" }, "")
    expect(subItem.negar.habilitada).toBe(false)
    expect(subItem.negar.dica).toBe(DICA_NEGACAO_ESCOPO)
  })

  it("exceção não sustenta decisão automática nenhuma e as duas dicas ficam visíveis", () => {
    const e = estadoDecisaoAutomatica({ ...base, reembolsavel: "excecao" }, "500,00")
    expect(e.aprovar.habilitada).toBe(false)
    expect(e.negar.habilitada).toBe(false)
    expect(e.aprovar.dica).toBe(DICA_APROVACAO_AUTOMATICA)
    expect(e.negar.dica).toBe(DICA_NEGACAO_AUTOMATICA)
  })
})

describe("rebaixarDecisaoAutomatica", () => {
  it("trocar reembolsavel de 'sim' para 'vedado' derruba 'aprovar' para 'nenhuma'", () => {
    const marcada: RegraExtraida = {
      ...regra("x", "governanca-do-processo"),
      decisaoAutomatica: "aprovar",
    }
    expect(rebaixarDecisaoAutomatica({ ...marcada, reembolsavel: "vedado" }, "500,00")).toEqual({
      decisaoAutomatica: "nenhuma",
    })
  })

  it("zerar o valor derruba 'aprovar'", () => {
    const marcada: RegraExtraida = {
      ...regra("x", "governanca-do-processo"),
      decisaoAutomatica: "aprovar",
    }
    expect(rebaixarDecisaoAutomatica(marcada, "")).toEqual({ decisaoAutomatica: "nenhuma" })
    expect(rebaixarDecisaoAutomatica(marcada, "500,00")).toEqual({})
  })

  it("regra sem marcação nunca é patcheada", () => {
    expect(rebaixarDecisaoAutomatica(regra("x", "governanca-do-processo"), "")).toEqual({})
  })

  it("'negar' sobrevive enquanto a regra continuar sustentando o alcance da marcação", () => {
    const vedada: RegraExtraida = {
      ...regra("x", "governanca-do-processo"),
      reembolsavel: "vedado",
      decisaoAutomatica: "negar",
    }
    // Sem categoria a marcação é teto GERAL: sem valor ela não alcança nada.
    expect(rebaixarDecisaoAutomatica(vedada, "")).toEqual({ decisaoAutomatica: "nenhuma" })
    expect(rebaixarDecisaoAutomatica(vedada, "5.000,00")).toEqual({})
    expect(rebaixarDecisaoAutomatica({ ...vedada, reembolsavel: "sim" }, "5.000,00")).toEqual({
      decisaoAutomatica: "nenhuma",
    })
  })

  it("B-2: apagar a categoria de uma regra que nega a categoria derruba a marcação", () => {
    const negaHospedagem: RegraExtraida = {
      ...regra("x", "hospedagem-e-viagem"),
      categoria: "hospedagem",
      escopo: "categoria",
      reembolsavel: "vedado",
      decisaoAutomatica: "negar",
    }
    expect(rebaixarDecisaoAutomatica(negaHospedagem, "")).toEqual({})
    // É o patch que o `<select>` de categoria emite: sem categoria, "nega tudo".
    expect(
      rebaixarDecisaoAutomatica({ ...negaHospedagem, categoria: null, escopo: "item" }, ""),
    ).toEqual({ decisaoAutomatica: "nenhuma" })
  })

  it("B-1/B-4: digitar um valor derruba a negação de categoria; desmarcar o escopo também", () => {
    const negaHospedagem: RegraExtraida = {
      ...regra("x", "hospedagem-e-viagem"),
      categoria: "hospedagem",
      escopo: "categoria",
      reembolsavel: "vedado",
      decisaoAutomatica: "negar",
    }
    expect(rebaixarDecisaoAutomatica(negaHospedagem, "800,00")).toEqual({
      decisaoAutomatica: "nenhuma",
    })
    expect(rebaixarDecisaoAutomatica({ ...negaHospedagem, escopo: "item" }, "")).toEqual({
      decisaoAutomatica: "nenhuma",
    })
  })
})

describe("semAutorizacaoDeAprovacao", () => {
  it("política sem teto nenhum: true (é o estado da política real hoje)", () => {
    expect(semAutorizacaoDeAprovacao(regrasPoliticaSchema.parse({}))).toBe(true)
  })

  it("teto global ou teto por categoria: false", () => {
    expect(
      semAutorizacaoDeAprovacao(regrasPoliticaSchema.parse({ aprovacaoAutomaticaAte: 200 })),
    ).toBe(false)
    expect(
      semAutorizacaoDeAprovacao(
        regrasPoliticaSchema.parse({ aprovacaoAutomaticaPorCategoria: { alimentacao: 70 } }),
      ),
    ).toBe(false)
  })

  it("teto de negação sozinho não é autorização de aprovação", () => {
    expect(semAutorizacaoDeAprovacao(regrasPoliticaSchema.parse({ negacaoAcimaDe: 5000 }))).toBe(
      true,
    )
  })
})

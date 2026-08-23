import { describe, expect, it } from "vitest"
import { TEMAS_POLITICA, type RegraExtraida } from "@contracts/types"
import { formatBRL } from "@/lib/format"
import {
  adicionarRegra,
  agruparPorTema,
  editarRegra,
  gerarId,
  novaRegra,
  removerRegra,
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

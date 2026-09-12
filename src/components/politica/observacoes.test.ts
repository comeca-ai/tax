import { describe, expect, it } from "vitest";
import {
  adicionarObservacao,
  agruparObservacoes,
  editarObservacao,
  ehCabecalhoTema,
  removerObservacao,
  tituloDoTema,
  posicaoInserida,
} from "./observacoes";

const LISTA = [
  "Regra solta",
  "— Alimentação —",
  "Almoço até R$ 80",
  "— Hospedagem e viagem —",
  "— Governança do processo —",
  "VEDADO: bebidas",
];

describe("ehCabecalhoTema / tituloDoTema", () => {
  it("reconhece cabeçalho com travessões", () => {
    expect(ehCabecalhoTema("— Alimentação —")).toBe(true);
    expect(ehCabecalhoTema(" — A — ")).toBe(true);
    expect(ehCabecalhoTema("— x")).toBe(false);
    expect(ehCabecalhoTema("VEDADO: bebidas")).toBe(false);
  });

  it("extrai o título", () => {
    expect(tituloDoTema("— Alimentação —")).toBe("Alimentação");
    expect(tituloDoTema(" — A — ")).toBe("A");
  });
});

describe("agruparObservacoes", () => {
  it("lista vazia devolve vazio", () => {
    expect(agruparObservacoes([])).toEqual([]);
  });

  it("sem cabeçalho gera um único grupo tema null", () => {
    expect(agruparObservacoes(["a", "b"])).toEqual([
      { tema: null, indiceCabecalho: null, itens: [{ indice: 0, texto: "a" }, { indice: 1, texto: "b" }] },
    ]);
  });

  it("cabeçalho no início abre o primeiro grupo", () => {
    const grupos = agruparObservacoes(["— Alimentação —", "Almoço"]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].tema).toBe("Alimentação");
    expect(grupos[0].indiceCabecalho).toBe(0);
    expect(grupos[0].itens).toEqual([{ indice: 1, texto: "Almoço" }]);
  });

  it("linhas antes do primeiro cabeçalho, cabeçalho sem itens e índices originais", () => {
    const grupos = agruparObservacoes(LISTA);
    expect(grupos.map((g) => g.tema)).toEqual([
      null,
      "Alimentação",
      "Hospedagem e viagem",
      "Governança do processo",
    ]);
    expect(grupos[0].itens).toEqual([{ indice: 0, texto: "Regra solta" }]);
    expect(grupos[1]).toEqual({
      tema: "Alimentação",
      indiceCabecalho: 1,
      itens: [{ indice: 2, texto: "Almoço até R$ 80" }],
    });
    expect(grupos[2].itens).toEqual([]);
    expect(grupos[3].itens).toEqual([{ indice: 5, texto: "VEDADO: bebidas" }]);
  });
});

describe("editarObservacao", () => {
  it("altera só o índice, com trim, sem mutar a entrada", () => {
    const copia = [...LISTA];
    const nova = editarObservacao(LISTA, 2, "  Almoço até R$ 100  ");
    expect(nova[2]).toBe("Almoço até R$ 100");
    expect(nova.filter((_, i) => i !== 2)).toEqual(LISTA.filter((_, i) => i !== 2));
    expect(LISTA).toEqual(copia);
    expect(nova).not.toBe(LISTA);
  });

  it("texto vazio ou índice fora devolvem a mesma referência", () => {
    expect(editarObservacao(LISTA, 2, "   ")).toBe(LISTA);
    expect(editarObservacao(LISTA, 99, "x")).toBe(LISTA);
    expect(editarObservacao(LISTA, -1, "x")).toBe(LISTA);
  });
});

describe("removerObservacao", () => {
  it("remove o índice sem mutar a entrada", () => {
    const copia = [...LISTA];
    const nova = removerObservacao(LISTA, 0);
    expect(nova).toEqual(LISTA.slice(1));
    expect(LISTA).toEqual(copia);
  });

  it("índice inválido devolve a mesma referência", () => {
    expect(removerObservacao(LISTA, 42)).toBe(LISTA);
  });
});

describe("adicionarObservacao", () => {
  it("insere antes do próximo cabeçalho", () => {
    const nova = adicionarObservacao(LISTA, " Jantar ", 1);
    expect(nova).toEqual([
      "Regra solta",
      "— Alimentação —",
      "Almoço até R$ 80",
      "Jantar",
      "— Hospedagem e viagem —",
      "— Governança do processo —",
      "VEDADO: bebidas",
    ]);
  });

  it("último grupo vai para o fim", () => {
    expect(adicionarObservacao(LISTA, "Prazo 30 dias", 4)).toEqual([...LISTA, "Prazo 30 dias"]);
  });

  it("null (Sem tema) entra antes do primeiro cabeçalho", () => {
    expect(adicionarObservacao(LISTA, "x", null)).toEqual(["Regra solta", "x", ...LISTA.slice(1)]);
    expect(adicionarObservacao(["— A —", "r1"], "x", null)).toEqual(["x", "— A —", "r1"]);
  });

  it("null sem cabeçalhos vai para o fim", () => {
    expect(adicionarObservacao(["r1", "r2"], "x", null)).toEqual(["r1", "r2", "x"]);
    expect(adicionarObservacao([], "x", null)).toEqual(["x"]);
  });

  it("cabeçalho inexistente vai para o fim", () => {
    expect(adicionarObservacao(LISTA, "x", 99)).toEqual([...LISTA, "x"]);
    expect(adicionarObservacao(LISTA, "x", 0)).toEqual([...LISTA, "x"]); // índice que não é cabeçalho
  });

  it("texto vazio devolve a mesma referência", () => {
    expect(adicionarObservacao(LISTA, "  ", 1)).toBe(LISTA);
  });
});

describe("posicaoInserida", () => {
  it("detecta inserção no meio (antes do próximo cabeçalho)", () => {
    const depois = adicionarObservacao(LISTA, "nova", 1); // grupo Alimentação
    const pos = posicaoInserida(LISTA, depois);
    expect(pos).toBe(3);
    expect(depois[pos]).toBe("nova");
  });
  it("inserção no fim devolve o tamanho antigo", () => {
    const depois = [...LISTA, "fim"];
    expect(posicaoInserida(LISTA, depois)).toBe(LISTA.length);
  });
  it("inserção em 'Sem tema' vai antes do primeiro cabeçalho → posição 1", () => {
    const depois = adicionarObservacao(LISTA, "solta", null);
    expect(posicaoInserida(LISTA, depois)).toBe(1);
    expect(depois[1]).toBe("solta");
  });
});

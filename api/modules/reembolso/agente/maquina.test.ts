import { describe, expect, it } from "vitest";
import {
  interpretarConsumo,
  interpretarSimNao,
  normalizarPlaca,
  proximoPasso,
  type ContextoConversa,
  type EstadoConversa,
} from "./maquina";

const COLABORADOR = {
  nome: "João Silva",
  email: "joao@empresa.com",
  telefone: "5511998887777",
  matricula: "1234",
};
const EMPRESA = "START UP LTDA";

function passo(
  estado: EstadoConversa,
  texto: string,
  contexto: ContextoConversa = {},
) {
  return proximoPasso({
    estado,
    contexto,
    colaborador: COLABORADOR,
    empresaNome: EMPRESA,
    texto,
  });
}

describe("interpretarSimNao", () => {
  it("reconhece variações de sim", () => {
    for (const t of ["sim", "Sim!", "isso", "confirma", "ok", "certo"]) {
      expect(interpretarSimNao(t)).toBe(true);
    }
  });
  it("reconhece variações de não (com e sem acento)", () => {
    for (const t of ["não", "nao", "Não!", "n", "errado"]) {
      expect(interpretarSimNao(t)).toBe(false);
    }
  });
  it("retorna null para ambíguo/vazio", () => {
    expect(interpretarSimNao("talvez")).toBeNull();
    expect(interpretarSimNao("")).toBeNull();
  });
});

describe("normalizarPlaca / interpretarConsumo", () => {
  it("aceita placas Mercosul e antigas, com ou sem hífen", () => {
    expect(normalizarPlaca("ABC1D23")).toBe("ABC1D23");
    expect(normalizarPlaca("abc-1234")).toBe("ABC1234");
    expect(normalizarPlaca("AB-12")).toBeNull();
  });
  it("interpreta consumo com vírgula ou ponto e rejeita absurdos", () => {
    expect(interpretarConsumo("12,5")).toBe(12.5);
    expect(interpretarConsumo("faz 10 por litro")).toBe(10);
    expect(interpretarConsumo("abc")).toBeNull();
    expect(interpretarConsumo("99")).toBeNull();
  });
});

describe("onboarding conversacional — fluxo feliz com veículo", () => {
  it("percorre todos os estados até pronto", () => {
    // 1. Primeira mensagem → saudação + confirmação de dados
    const p1 = passo("inicio", "oi");
    expect(p1.estado).toBe("confirmando_dados");
    expect(p1.respostas.join(" ")).toContain("João");
    expect(p1.respostas.join(" ")).toContain("START UP LTDA");
    expect(p1.respostas.join(" ")).toContain("1234");

    // 2. Confirma dados → pergunta combustível
    const p2 = passo("confirmando_dados", "sim");
    expect(p2.estado).toBe("declarando_combustivel");
    expect(p2.acoes).toEqual([]);

    // 3. Declara combustível = sim → pergunta viagem
    const p3 = passo("declarando_combustivel", "sim");
    expect(p3.estado).toBe("declarando_viagem");
    expect(p3.contexto.combustivel).toBe(true);

    // 4. Viagem = não → pergunta refeição
    const p4 = passo("declarando_viagem", "não", p3.contexto);
    expect(p4.estado).toBe("declarando_refeicao");
    expect(p4.contexto.viagem).toBe(false);

    // 5. Refeição = sim → salva declarações e pede placa (declarou combustível)
    const p5 = passo("declarando_refeicao", "sim", p4.contexto);
    expect(p5.estado).toBe("coletando_veiculo_placa");
    expect(p5.acoes).toEqual([{ tipo: "salvar_declaracoes" }]);

    // 6. Placa → descrição
    const p6 = passo("coletando_veiculo_placa", "ABC1D23", p5.contexto);
    expect(p6.estado).toBe("coletando_veiculo_descricao");
    expect(p6.contexto.veiculoPlaca).toBe("ABC1D23");

    // 7. Descrição → consumo
    const p7 = passo("coletando_veiculo_descricao", "Onix prata 2022", p6.contexto);
    expect(p7.estado).toBe("coletando_veiculo_consumo");
    expect(p7.contexto.veiculoDescricao).toBe("Onix prata 2022");

    // 8. Consumo → cria veículo, confirma, pronto
    const p8 = passo("coletando_veiculo_consumo", "12,5", p7.contexto);
    expect(p8.estado).toBe("pronto");
    expect(p8.contexto.veiculoConsumo).toBe(12.5);
    expect(p8.acoes).toEqual([{ tipo: "criar_veiculo" }, { tipo: "marcar_confirmado" }]);
    expect(p8.respostas.join(" ")).toContain("ABC1D23");
  });
});

describe("onboarding — sem combustível pula o veículo (D-001)", () => {
  it("declarou não para combustível → pronto direto, sem pedir placa", () => {
    const p3 = passo("declarando_combustivel", "não");
    const p4 = passo("declarando_viagem", "não", p3.contexto);
    const p5 = passo("declarando_refeicao", "sim", p4.contexto);
    expect(p5.estado).toBe("pronto");
    expect(p5.acoes).toEqual([
      { tipo: "salvar_declaracoes" },
      { tipo: "marcar_confirmado" },
    ]);
    expect(p5.respostas.join(" ")).not.toContain("placa");
  });
});

describe("onboarding — robustez", () => {
  it("resposta inválida repete a pergunta sem avançar", () => {
    const p = passo("declarando_combustivel", "sei lá");
    expect(p.estado).toBe("declarando_combustivel");
    expect(p.contexto.combustivel).toBeUndefined();
  });

  it("placa inválida não avança", () => {
    const p = passo("coletando_veiculo_placa", "minha placa é essa");
    expect(p.estado).toBe("coletando_veiculo_placa");
  });

  it("dados errados → marca divergência e segue o fluxo (D-005)", () => {
    const p = passo("confirmando_dados", "não, meu e-mail mudou");
    expect(p.estado).toBe("declarando_combustivel");
    expect(p.acoes[0].tipo).toBe("marcar_divergencia");
  });

  it("resposta ambígua na confirmação não avança", () => {
    const p = passo("confirmando_dados", "bom dia");
    expect(p.estado).toBe("confirmando_dados");
  });

  it("estado pronto: responde sem ações (despesas chegam na v1.6.0)", () => {
    const p = passo("pronto", "tenho um cupom aqui");
    expect(p.estado).toBe("pronto");
    expect(p.acoes).toEqual([]);
  });
});

import { describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import {
  dependenciasVerificacaoFiscal,
  verificarFiscalAntesDaDecisao,
} from "./service";
import {
  identidadeFiscalDoUpload,
  integridadeFiscalConfere,
} from "./documento";
import {
  exigeRevisaoFiscal,
  type ResultadoVerificacaoFiscal,
} from "../../../../contracts/fiscal";
import type { TrpcContext } from "../../../context";

function key(modelo: string) {
  const base = `35260914200166000166${modelo}001000000007100000000`;
  const total = [...base]
    .reverse()
    .reduce((sum, digit, index) => sum + Number(digit) * (2 + (index % 8)), 0);
  const dv = 11 - (total % 11);
  return base + (dv >= 10 ? 0 : dv);
}
const ctx: TrpcContext = {
  req: new Request("http://localhost"),
  resHeaders: new Headers(),
  usuario: {
    id: 7,
    perfil: "cliente",
    nome: "Fixture",
    email: "fixture@example.invalid",
  },
};
const input = { empresaId: 4, notaFiscalId: 8 };
const id = "865454c3-aa0e-4eca-8837-d42865d2bedd";
function fixture() {
  const resultado: ResultadoVerificacaoFiscal = {
    estado: "processando",
    solicitada: true,
    configuracaoVersao: 3,
    consultaId: null,
    modelo: "55",
    verificadaEm: null,
  };
  const reserva = {
    existente: false,
    id,
    resultado,
    documento: {
      chave: key("55") as string | null,
      chaveEstado: "valida",
      integridade: true,
    },
  };
  const deps = {
    ...dependenciasVerificacaoFiscal,
    autorizar: vi.fn().mockResolvedValue({}),
    reservar: vi.fn().mockResolvedValue(reserva),
    concluir: vi.fn().mockResolvedValue(undefined),
    consultar: vi
      .fn()
      .mockResolvedValue({
        consultaId: id,
        resultado: {
          estado: "autorizada",
          httpStatus: 200,
          consultadaEm: "2026-09-14T13:00:00Z",
        },
      }),
  };
  return { deps, reserva };
}
describe("opção fiscal na decisão", () => {
  it("desativada mantém fluxo e não lê o provedor", async () => {
    const { deps, reserva } = fixture();
    reserva.resultado = {
      ...reserva.resultado,
      solicitada: false,
      estado: "desativada",
    };
    const r = await verificarFiscalAntesDaDecisao(ctx, input, deps);
    expect(exigeRevisaoFiscal(r)).toBe(false);
    expect(deps.consultar).not.toHaveBeenCalled();
    expect(deps.concluir).not.toHaveBeenCalled();
  });
  it("recusa outra empresa antes de ler documento ou reservar", async () => {
    const { deps } = fixture();
    deps.autorizar.mockRejectedValue(new TRPCError({ code: "FORBIDDEN" }));
    await expect(
      verificarFiscalAntesDaDecisao(ctx, input, deps)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(deps.reservar).not.toHaveBeenCalled();
    expect(deps.consultar).not.toHaveBeenCalled();
  });
  it.each([
    ["65", "valida", true, "nao_suportada"],
    [null, "ausente", true, "sem_chave"],
    [null, "invalida", true, "chave_invalida"],
    ["55", "valida", false, "integridade_divergente"],
  ])(
    "modelo/chave %s, %s exige revisão sem rede",
    async (modelo, chaveEstado, integridade, estado) => {
      const { deps, reserva } = fixture();
      reserva.documento = {
        chave: modelo ? key(String(modelo)) : null,
        chaveEstado: String(chaveEstado),
        integridade: Boolean(integridade),
      };
      const r = await verificarFiscalAntesDaDecisao(ctx, input, deps);
      expect(r.estado).toBe(estado);
      expect(exigeRevisaoFiscal(r)).toBe(true);
      expect(deps.consultar).not.toHaveBeenCalled();
      expect(deps.concluir).toHaveBeenCalledOnce();
    }
  );
  it("55 chama uma vez com IDs e persiste retorno mínimo", async () => {
    const { deps } = fixture();
    const r = await verificarFiscalAntesDaDecisao(ctx, input, deps);
    expect(r.estado).toBe("autorizada");
    expect(exigeRevisaoFiscal(r)).toBe(false);
    expect(deps.consultar).toHaveBeenCalledExactlyOnceWith(ctx, {
      ...input,
      solicitacaoId: id,
      confirmarConsulta: true,
    });
    expect(JSON.stringify(r)).not.toContain(key("55"));
    expect(deps.concluir).toHaveBeenCalledWith(input, id, ctx.usuario!.id, r);
  });
  it.each(["autorizada", "processando", "timeout_incerto"] as const)(
    "repetição %s preserva reserva e não repete consulta",
    async estado => {
      const { deps, reserva } = fixture();
      reserva.existente = true;
      reserva.resultado.estado = estado;
      expect(
        (await verificarFiscalAntesDaDecisao(ctx, input, deps)).estado
      ).toBe(estado);
      expect(deps.consultar).not.toHaveBeenCalled();
      expect(deps.concluir).not.toHaveBeenCalled();
    }
  );
  it.each([
    "cancelada",
    "destinatario_divergente",
    "timeout_incerto",
    "nao_localizada",
  ])("resultado %s mantém exigência de revisão", async estado => {
    const { deps } = fixture();
    deps.consultar.mockResolvedValue({ consultaId: id, resultado: { estado } });
    expect(
      exigeRevisaoFiscal(await verificarFiscalAntesDaDecisao(ctx, input, deps))
    ).toBe(true);
  });
  it("erro após reserva preserva identificador e remove dados brutos", async () => {
    const { deps } = fixture();
    deps.consultar.mockRejectedValue(new Error("secret-and-raw-sql"));
    const r = await verificarFiscalAntesDaDecisao(ctx, input, deps);
    expect(r.estado).toBe("indisponivel");
    expect(r.consultaId).toBe(id);
    expect(JSON.stringify(r)).not.toContain("secret");
    expect(deps.consultar).toHaveBeenCalledOnce();
  });
  it("orçamento esgotado não é apresentado como nota inválida", async () => {
    const { deps } = fixture();
    deps.consultar.mockRejectedValue(
      new TRPCError({ code: "TOO_MANY_REQUESTS" })
    );
    expect((await verificarFiscalAntesDaDecisao(ctx, input, deps)).estado).toBe(
      "sem_orcamento"
    );
  });
});
it("identidade liga a chave extraída aos bytes e detecta adulteração", () => {
  const arquivo = Buffer.from("sintetico-fiscal").toString("base64");
  const identidade = identidadeFiscalDoUpload(arquivo, key("65"));
  expect(identidade.chave).toBe(key("65"));
  expect(
    integridadeFiscalConfere(arquivo, identidade.hash, identidade.hash)
  ).toBe(true);
  expect(
    integridadeFiscalConfere(
      Buffer.from("outro").toString("base64"),
      identidade.hash,
      identidade.hash
    )
  ).toBe(false);
  expect(
    identidadeFiscalDoUpload(arquivo, key("55").slice(0, -1) + "9").chaveEstado
  ).toBe("invalida");
});

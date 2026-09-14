import { ErroComprovanteWhatsapp } from "./comprovanteDb";
import { afterEach, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { whatsappInbox } from "../../../../db/schema";
import * as campoService from "../campo/servico";
import { novoEstadoCampo } from "../campo/dominio";
import {
  executarCicloWhatsapp,
  selecionarIdentidadeUnica,
  telefonesPermitidos,
  whatsappPocHabilitado,
  tratarMensagemCampo,
  selecionarVeiculoCampo,
  processarMidiaCampo,
  criarCicloSerialWhatsapp,
  dentroDaJanelaDeResposta,
} from "./worker";
const dbMock = vi.hoisted(() => ({
  get: vi.fn((): unknown => {
    throw new Error("DB não permitido neste teste");
  }),
}));
vi.mock("../../../queries/connection", () => ({ getDb: dbMock.get }));
afterEach(() => {
  vi.unstubAllEnvs();
  dbMock.get.mockReset();
  vi.restoreAllMocks();
});
it("adapta mensagem para campo preservando ID, GPS e timestamp original", async () => {
  const interpretar = vi
    .spyOn(campoService, "interpretarMensagemCampo")
    .mockResolvedValue({ textoResposta: "Localização solicitada" });
  const identity = {
    empresaId: 1,
    colaboradorId: 2,
    telefone: "5511999999999",
  };
  const response = await tratarMensagemCampo(identity, {
    id: "wamid.campo",
    type: "text",
    text: { body: "check-in ABC1D23" },
    timestamp: "1717000000",
  });
  expect(response).toBe("Localização solicitada");
  expect(interpretar).toHaveBeenCalledWith(identity, {
    id: "wamid.campo",
    type: "text",
    text: "check-in ABC1D23",
    timestamp: "1717000000",
  });
});
it("não infere veículo histórico e rejeita pendência expirada", () => {
  const estado = novoEstadoCampo();
  expect(selecionarVeiculoCampo(estado)).toBeNull();
  estado.conversa = {
    respostas: [],
    pendente: {
      tipo: "check_in",
      jornadaId: "j",
      veiculo: "ABC1D23",
      expiraEm: "2026-09-13T12:00:00Z",
    },
  };
  expect(
    selecionarVeiculoCampo(estado, Date.parse("2026-09-13T11:59:00Z"))
  ).toBe("ABC1D23");
  expect(
    selecionarVeiculoCampo(estado, Date.parse("2026-09-13T12:01:00Z"))
  ).toBeNull();
});

function dependenciasMidia() {
  const extracao = {
    cnpjEmitente: null,
    cfop: null,
    ncm: null,
    cst: null,
    valor: 50,
    dataFatoGerador: "2026-09-13",
    litros: 10,
    categoriaSugerida: "combustivel" as const,
    confiancaExtracao: "baixa" as const,
    camposPendentes: [],
    provedor: "mock",
    avisos: [],
  };
  const registro = { despesaId: 10, notaFiscalId: 20, extracao };
  const deps = {
    localizar: vi.fn().mockResolvedValueOnce(null).mockResolvedValue(registro),
    download: vi.fn().mockResolvedValue({
      arquivoNome: "nota.pdf",
      arquivoMime: "application/pdf",
      conteudo: Buffer.from("%PDF-test"),
    }),
    extrair: vi.fn().mockResolvedValue(extracao),
    registrar: vi.fn().mockResolvedValue({
      despesaId: 10,
      situacao: "em_revisao",
      idempotente: false,
    }),
    finalizar: vi.fn().mockResolvedValue(null),
    veiculo: vi.fn().mockResolvedValue("ABC1D23"),
    importar: vi
      .fn()
      .mockResolvedValue({ documentoId: "doc", duplicado: false }),
  };
  return { deps, extracao, registro };
}
it("comprovante usa OCR uma vez e reutiliza extração na ponte documental", async () => {
  const { deps, extracao } = dependenciasMidia();
  const identity = {
    empresaId: 1,
    colaboradorId: 2,
    telefone: "5511999999999",
  };
  const response = await processarMidiaCampo(
    identity,
    { id: "wamid.media", mediaId: "123" },
    new Date(),
    deps
  );
  expect(response).toBe("Comprovante Recebido!");
  expect(deps.extrair).toHaveBeenCalledTimes(1);
  expect(deps.importar.mock.calls[0]?.slice(0, 2)).toEqual([
    identity,
    { notaFiscalId: 20, veiculo: "ABC1D23" },
  ]);
  expect(await deps.importar.mock.calls[0]![2].extrair({})).toBe(extracao);
});
it("retry após despesa persistida não baixa mídia nem chama OCR novamente", async () => {
  const { deps, registro } = dependenciasMidia();
  deps.localizar.mockReset().mockResolvedValue(registro);
  await processarMidiaCampo(
    { empresaId: 1, colaboradorId: 2, telefone: "5511999999999" },
    { id: "wamid.media", mediaId: "123" },
    new Date(),
    deps
  );
  expect(deps.download).not.toHaveBeenCalled();
  expect(deps.extrair).not.toHaveBeenCalled();
  expect(deps.registrar).not.toHaveBeenCalled();
  expect(deps.finalizar).toHaveBeenCalledTimes(1);
  expect(deps.importar).toHaveBeenCalledTimes(1);
});
it("sem contexto de veículo, mantém despesa explícita em revisão sem importar inventando placa", async () => {
  const { deps } = dependenciasMidia();
  deps.veiculo.mockResolvedValue(null);
  const result = await processarMidiaCampo(
    { empresaId: 1, colaboradorId: 2, telefone: "5511999999999" },
    { id: "wamid.media", mediaId: "123" },
    new Date(),
    deps
  );
  expect(deps.importar).not.toHaveBeenCalled();
  expect(result).toBe("Comprovante Recebido!");
});
it("scanner compartilha exclusão com processamento e preserva cursor e intervalo", async () => {
  let finish!: () => void;
  let time = 100_000;
  const processar = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<void>(resolve => {
          finish = resolve;
        })
    )
    .mockResolvedValue(undefined);
  const lembretes = vi.fn().mockResolvedValue({ proximoCursor: 100 });
  const ciclo = criarCicloSerialWhatsapp({
    habilitado: () => true,
    processar,
    lembretes,
    agora: () => time,
  });
  const first = ciclo();
  await ciclo();
  expect(processar).toHaveBeenCalledTimes(1);
  expect(lembretes).not.toHaveBeenCalled();
  finish();
  await first;
  expect(lembretes).toHaveBeenCalledWith(0);
  await ciclo();
  expect(lembretes).toHaveBeenCalledTimes(1);
  time += 60_000;
  await ciclo();
  expect(lembretes).toHaveBeenLastCalledWith(100);
});
it("scanner falho libera ciclo e respeita gate desabilitado", async () => {
  let enabled = true;
  const processar = vi.fn().mockResolvedValue(undefined);
  const lembretes = vi.fn().mockRejectedValue(new Error("DB"));
  const ciclo = criarCicloSerialWhatsapp({
    habilitado: () => enabled,
    processar,
    lembretes,
    agora: () => 100_000,
  });
  await expect(ciclo()).rejects.toThrow("DB");
  await ciclo();
  expect(processar).toHaveBeenCalledTimes(2);
  enabled = false;
  await ciclo();
  expect(processar).toHaveBeenCalledTimes(2);
});
it("exige habilitação, credenciais e allowlist explícitas antes de rede/DB", async () => {
  vi.stubEnv("WHATSAPP_POC_ENABLED", "false");
  expect(whatsappPocHabilitado()).toBe(false);
  await expect(executarCicloWhatsapp()).resolves.toBeUndefined();
  vi.stubEnv("WHATSAPP_POC_ENABLED", "true");
  vi.stubEnv("DIALOG_360_API_KEY", "dummy");
  vi.stubEnv("DIALOG_360_WEBHOOK_SECRET", "dummy");
  vi.stubEnv("WHATSAPP_POC_ALLOWED_PHONES", "");
  expect(whatsappPocHabilitado()).toBe(false);
  await expect(executarCicloWhatsapp()).resolves.toBeUndefined();
  vi.stubEnv("WHATSAPP_POC_ALLOWED_PHONES", "5511999999999");
  expect(whatsappPocHabilitado()).toBe(true);
});
it("identidade ambígua ou suspensa nunca escolhe a primeira empresa", () => {
  const a = { empresaId: 1, colaboradorId: 2, situacao: "ativo" };
  expect(selecionarIdentidadeUnica([a, { ...a, empresaId: 3 }])).toBeNull();
  expect(
    selecionarIdentidadeUnica([{ ...a, situacao: "suspenso" }])
  ).toBeNull();
  expect(selecionarIdentidadeUnica([a, a])).toEqual(a);
});
it("allowlist aceita somente E164 canônico sem aproximação", () => {
  expect([
    ...telefonesPermitidos("5511999999999, 5511999999999, 999, +5511222222222"),
  ]).toEqual(["5511999999999"]);
});
it("varre crash na quinta tentativa para terminal antes de buscar novas entradas", async () => {
  vi.stubEnv("WHATSAPP_POC_ENABLED", "true");
  vi.stubEnv("DIALOG_360_API_KEY", "dummy");
  vi.stubEnv("DIALOG_360_WEBHOOK_SECRET", "dummy");
  vi.stubEnv("WHATSAPP_POC_ALLOWED_PHONES", "5511999999999");
  const updates: {
    table: unknown;
    values: unknown;
    condition: Parameters<MySqlDialect["sqlToQuery"]>[0];
  }[] = [];
  const fake = {
    update: (table: unknown) => ({
      set: (values: unknown) => ({
        where: async (condition: Parameters<MySqlDialect["sqlToQuery"]>[0]) => {
          updates.push({ table, values, condition });
        },
      }),
    }),
    transaction: async (fn: (tx: unknown) => unknown) =>
      fn({
        select: () => ({
          from: () => ({
            where: () => ({ orderBy: () => ({ limit: () => ({ for: async () => [] }) }) }),
          }),
        }),
      }),
  };
  dbMock.get.mockReturnValue(fake);
  await executarCicloWhatsapp();
  expect(updates[0]?.table).toBe(whatsappInbox);
  expect(updates[0]?.values).toMatchObject({ status: "esgotado" });
  const query = new MySqlDialect().sqlToQuery(updates[0]!.condition);
  expect(query.sql).toContain("`tentativas` >= ?");
  expect(query.params).toContain(5);
  expect(query.params).toContain("processando");
});

it("janela de resposta permite até antes de 24h e rejeita datas futuras ou inválidas", () => {
  const recebido = "2026-09-14T09:15:00.000Z";
  const inicio = Date.parse(recebido);
  expect(dentroDaJanelaDeResposta(recebido, inicio)).toBe(true);
  expect(dentroDaJanelaDeResposta(recebido, inicio + 24 * 3600_000 - 1)).toBe(true);
  expect(dentroDaJanelaDeResposta(recebido, inicio + 24 * 3600_000)).toBe(false);
  expect(dentroDaJanelaDeResposta(recebido, inicio - 1)).toBe(false);
  expect(dentroDaJanelaDeResposta(undefined, inicio)).toBe(false);
});

it("duplicata documental recebe a mesma confirmação simples e não segue para conciliação", async () => {
  const { deps } = dependenciasMidia();
  deps.registrar.mockRejectedValue(
    new ErroComprovanteWhatsapp("duplicado", "DUPLICADO")
  );
  const response = await processarMidiaCampo(
    { empresaId: 1, colaboradorId: 2, telefone: "5511999999999" },
    { id: "wamid.duplicate", mediaId: "123" },
    new Date(),
    deps
  );
  expect(response).toBe("Comprovante Recebido!");
  expect(deps.importar).not.toHaveBeenCalled();
});

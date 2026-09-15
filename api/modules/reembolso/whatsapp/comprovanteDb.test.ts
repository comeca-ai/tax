import { beforeEach, expect, it, vi } from "vitest";
import {
  colaboradores,
  empresas,
  notasFiscais,
  whatsappInbox,
} from "../../../../db/schema";
import { receberComprovanteWhatsapp } from "./comprovanteDb";
import { fiscalDocumentos } from "../../../../db/fiscalSchema";
const state = vi.hoisted(() => ({
  collaborator: true,
  owner: 1,
  existing: true,
  duplicate: false,
  duplicateKey: false,
  selected: [] as unknown[],
  values: vi.fn(),
}));
vi.mock("../../../queries/connection", () => ({
  getDb: () => ({
    transaction: async (fn: (tx: unknown) => unknown) =>
      fn({
        select: () => ({
          from: (table: unknown) => {
            state.selected.push(table);
            return {
              where: () => ({
                limit: () => ({ for: async () => ((table === notasFiscais && state.duplicate) || (table === fiscalDocumentos && state.duplicateKey) ? [{ id: 123 }] : []) }),
                for: async () =>
                  table === colaboradores
                    ? state.collaborator
                      ? [{ id: 2, nome: "Teste", centroCusto: null }]
                      : []
                    : [
                        {
                          id: 1,
                          empresaId: state.owner,
                          colaboradorId: 2,
                          despesaId: state.existing ? 42 : null,
                          status: "falhou",
                        },
                      ],
              }),
            };
          },
        }),
        insert: () => ({
          ignore: () => ({ values: state.values }),
          values: state.values,
        }),
      }),
  }),
}));
const pedido = {
  empresaId: 1,
  colaboradorId: 2,
  mensagemId: "wamid.test",
  recebidoEm: null,
  comprovante: {
    arquivoNome: "recibo.pdf",
    arquivoMime: "application/pdf" as const,
    conteudo: Buffer.from("%PDF-test"),
  },
};
beforeEach(() => {
  state.collaborator = true;
  state.owner = 1;
  state.existing = true;
  state.duplicate = false;
  state.duplicateKey = false;
  state.selected = [];
  state.values.mockReset();
  state.values.mockResolvedValue([{ affectedRows: 0 }]);
});
it("valida vínculo antes da deduplicação", async () => {
  state.collaborator = false;
  await expect(receberComprovanteWhatsapp(pedido)).rejects.toMatchObject({
    codigo: "VINCULO_INVALIDO",
  });
  expect(state.selected).toEqual([colaboradores]);
  expect(state.values).not.toHaveBeenCalled();
});
it("replay de outro tenant não expõe despesa", async () => {
  state.owner = 99;
  await expect(receberComprovanteWhatsapp(pedido)).rejects.toMatchObject({
    codigo: "VINCULO_INVALIDO",
  });
  expect(state.selected).toEqual([colaboradores, empresas, whatsappInbox]);
});
it("replay com ownership válido retorna mesma despesa", async () => {
  await expect(receberComprovanteWhatsapp(pedido)).resolves.toEqual({
    despesaId: 42,
    situacao: "em_revisao",
    idempotente: true,
  });
});

it("mesmo binário em outra mensagem é bloqueado antes de criar nota ou despesa", async () => {
  state.existing = false;
  state.duplicate = true;
  await expect(
    receberComprovanteWhatsapp({ ...pedido, mensagemId: "wamid.other" })
  ).rejects.toMatchObject({ codigo: "DUPLICADO" });
  expect(state.selected).toEqual([
    colaboradores,
    empresas,
    whatsappInbox,
    notasFiscais,
  ]);
  // Apenas reserva de inbox, revertida pela transação real ao lançar o erro.
  expect(state.values).toHaveBeenCalledTimes(1);
});

it("mesma chave em outro binário também é bloqueada antes da despesa", async () => {
  state.existing = false;
  state.duplicateKey = true;
  const base = "3526091420016600016655001000000007100000000";
  const sum = [...base].reverse().reduce((s, d, i) => s + Number(d) * (2 + i % 8), 0);
  const dv = 11 - sum % 11;
  await expect(receberComprovanteWhatsapp({ ...pedido, mensagemId: "wamid.same-key", extracao: {
    chaveAcesso: base + (dv >= 10 ? 0 : dv), cnpjEmitente: null, cfop: null, ncm: null, cst: null, valor: 30,
    dataFatoGerador: "2026-09-15", litros: null, categoriaSugerida: "alimentacao", confiancaExtracao: "alta",
    camposPendentes: [], provedor: "fixture", avisos: [],
  } })).rejects.toMatchObject({ codigo: "DUPLICADO" });
  expect(state.selected).toEqual([colaboradores, empresas, whatsappInbox, notasFiscais, fiscalDocumentos]);
  expect(state.values).toHaveBeenCalledTimes(1);
});

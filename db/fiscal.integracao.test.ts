import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createPool, type Pool } from "mysql2/promise";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import { and, eq, inArray } from "drizzle-orm";
import {
  colaboradores,
  creditosApurados,
  despesas,
  empresas,
  logAuditoria,
  notasFiscais,
  usuarios,
} from "./schema";
import {
  fiscalConfiguracao,
  fiscalDocumentos,
  fiscalVerificacoes,
} from "./fiscalSchema";
import { nfeIoConsultas, nfeIoOrcamentos } from "./nfeioSchema";
import type { TrpcContext } from "../api/context";
import type { OcrExtracao } from "../contracts/types";
const injected = vi.hoisted(() => ({
  db: undefined as unknown,
  extrair: vi.fn(),
}));
vi.mock("../api/queries/connection", () => ({ getDb: () => injected.db }));
vi.mock("../api/modules/fiscal/ocr", () => ({
  getOcrProvider: () => ({ nome: "fixture", extrair: injected.extrair }),
}));
import { fiscalRouter } from "../api/routers/fiscal";
import { despesasRouter } from "../api/routers/despesas";
import { verificarFiscalAntesDaDecisao } from "../api/modules/fiscal/verificacao/service";
import { identificarSolicitanteWeb } from "../api/modules/reembolso/identificacaoDespesa";
import {
  receberComprovanteWhatsapp,
  finalizarComprovanteFiscalWhatsapp,
} from "../api/modules/reembolso/whatsapp/comprovanteDb";
import { whatsappInbox } from "./schema";

const raw = process.env.POC_TEST_DATABASE_URL;
const target = raw ? new URL(raw) : null;
if (
  target &&
  (target.protocol !== "mysql:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname) ||
    !/^\/reembolsa_poc_test_[a-zA-Z0-9_]+$/.test(target.pathname) ||
    target.search ||
    target.hash)
)
  throw new Error("Use banco local isolado reembolsa_poc_test_*");
let db: MySql2Database,
  pool: Pool,
  owner: number,
  colleague: number,
  outsider: number,
  empresa: number;
let foreignCompany: number, foreignPerson: number, targetPerson: number;
const run = randomUUID(),
  budget = `fiscal-${run}`;
const noteIds: number[] = [],
  expenseIds: number[] = [];
const calls: number[] = [];
let currentNote: number;
let viaWhatsapp = false;
let nextModel = "55";
let documentSequence = 0;
const ctx = (user = owner): TrpcContext => ({
  req: new Request("http://localhost"),
  resHeaders: new Headers(),
  usuario: {
    id: user,
    nome: "Fixture Fiscal",
    email: "fixture@example.invalid",
    perfil: "cliente",
  },
});
const fiscal = (user = owner) => fiscalRouter.createCaller(ctx(user));
const expenses = (user = owner) => despesasRouter.createCaller(ctx(user));
function key(model = "55") {
  const base = `35260914200166000166${model}001${String(documentSequence).padStart(9, "0")}100000000`;
  const sum = [...base]
    .reverse()
    .reduce((s, d, i) => s + Number(d) * (2 + (i % 8)), 0);
  const dv = 11 - (sum % 11);
  return base + (dv >= 10 ? 0 : dv);
}
async function upload(model = "55") {
  nextModel = model;
  documentSequence++;
  const result = await expenses(colleague).uploadNota({
    empresaId: empresa,
    arquivoNome: "fixture.jpg",
    arquivoMime: "image/jpeg",
    // Assinatura JPEG sintética; o OCR permanece simulado neste ensaio de banco.
    arquivoBase64: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from(`fixture-fiscal-${randomUUID()}`)]).toString("base64"),
  });
  noteIds.push(result.notaFiscalId);
  currentNote = result.notaFiscalId;
  return { empresaId: empresa, notaFiscalId: result.notaFiscalId };
}
describe.skipIf(!target)(
  "fiscal SQL: opção, autoria, documento e decisão web",
  () => {
    beforeAll(async () => {
      pool = createPool(target!.href);
      const [actual] = await pool.query("SELECT DATABASE() AS nome");
      if ((actual as { nome: string }[])[0].nome !== target!.pathname.slice(1))
        throw new Error("Banco divergente");
      db = drizzle(pool);
      injected.db = db;
      // Schema instalado previamente pelo operador somente neste banco descartável.
      await db.select().from(fiscalConfiguracao).limit(0);
      const addUser = async () => {
        const [r] = await db.insert(usuarios).values({
          nome: "Fixture Fiscal",
          email: `${randomUUID()}@example.invalid`,
          senhaHash: "fixture-no-login",
          perfil: "cliente",
        });
        return r.insertId;
      };
      owner = await addUser();
      colleague = await addUser();
      outsider = await addUser();
      const [e] = await db.insert(empresas).values({
        usuarioId: owner,
        razaoSocial: "Fixture Fiscal",
        cnpj: "99887766000155",
        cnaePrincipal: "6201501",
        regimeTributario: "simples_nacional",
        uf: "SP",
      });
      empresa = e.insertId;
      await db.insert(colaboradores).values({
        empresaId: empresa,
        usuarioId: colleague,
        nome: "Fixture Colaborador",
        centroCusto: "CC-FIXTURE",
        statusVinculo: "ativo",
      });
      const [f] = await db.insert(empresas).values({
        usuarioId: outsider,
        razaoSocial: "Fixture Outra",
        cnpj: "99887766000156",
        cnaePrincipal: "6201501",
        regimeTributario: "simples_nacional",
        uf: "SP",
      });
      foreignCompany = f.insertId;
      const [fp] = await db.insert(colaboradores).values({
        empresaId: foreignCompany,
        nome: "Fixture Outro Tenant",
        statusVinculo: "ativo",
      });
      foreignPerson = fp.insertId;
      const [tp] = await db.insert(colaboradores).values({
        empresaId: empresa,
        nome: "Fixture Solicitante Selecionado",
        centroCusto: "CC-SELECIONADO",
        statusVinculo: "ativo",
      });
      targetPerson = tp.insertId;
      await db
        .insert(nfeIoOrcamentos)
        .values({ id: budget, limite: 3, usadas: 0 });
      vi.stubEnv("NFE_IO_ENABLED", "true");
      vi.stubEnv("API_NFE_IO", "synthetic-data-key");
      vi.stubEnv("NFE_IO_BUDGET_ID", budget);
      injected.extrair.mockImplementation(async (): Promise<OcrExtracao> => ({
        chaveAcesso: key(nextModel),
        cnpjEmitente: "14200166000166",
        cfop: null,
        ncm: null,
        cst: null,
        valor: 30,
        dataFatoGerador: "2026-09-14",
        litros: null,
        categoriaSugerida: "alimentacao",
        confiancaExtracao: "alta",
        camposPendentes: [],
        provedor: "fixture",
        avisos: [],
        tipoDocumento: "nota_fiscal",
        confiancaTipo: "alta",
      }));
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init: RequestInit) => {
          expect(url).toBe(
            `https://nfe.api.nfe.io/v2/productinvoices/serpro/${key()}`
          );
          expect(init.redirect).toBe("error");
          expect(init.method).toBe("GET");
          // Prova de reserva ANTES da rede e de consulta ANTES da criação/decisão da despesa.
          const [ledger] = await db
            .select()
            .from(nfeIoOrcamentos)
            .where(eq(nfeIoOrcamentos.id, budget));
          expect(ledger.usadas).toBe(calls.length + 1);
          if (viaWhatsapp) {
            const [execucao] = await db
              .select()
              .from(fiscalVerificacoes)
              .where(eq(fiscalVerificacoes.orcamentoId, budget));
            currentNote = execucao.notaFiscalId;
            expect(execucao.usuarioId).toBeNull();
            expect(execucao.colaboradorId).toBe(targetPerson);
            const [provisoria] = await db
              .select()
              .from(despesas)
              .where(eq(despesas.notaFiscalId, currentNote));
            expect(provisoria.status).toBe("em_revisao");
            expect(
              await db
                .select()
                .from(logAuditoria)
                .where(
                  and(
                    eq(logAuditoria.entidadeId, provisoria.id),
                    eq(logAuditoria.acao, "reembolso_decisao")
                  )
                )
            ).toHaveLength(0);
            // Uma segunda conexão consegue tomar o lock durante o fetch simulado.
            await db.transaction(async tx => {
              await tx
                .select()
                .from(despesas)
                .where(eq(despesas.id, provisoria.id))
                .for("update");
            });
          } else {
            expect(
              await db
                .select()
                .from(despesas)
                .where(eq(despesas.notaFiscalId, currentNote))
            ).toHaveLength(0);
          }
          calls.push(currentNote);
          return new Response(
            JSON.stringify({
              codeModel: 55,
              currentStatus: "Authorized",
              environmentType: "Production",
              protocol: { accessKey: key(), statusCode: 100 },
              buyer: { federalTaxNumber: "99887766000155" },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        })
      );
    });
    afterAll(async () => {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
      if (!db) return;
      if (noteIds.length) {
        await db
          .delete(nfeIoConsultas)
          .where(inArray(nfeIoConsultas.notaFiscalId, noteIds));
        await db
          .delete(fiscalVerificacoes)
          .where(inArray(fiscalVerificacoes.notaFiscalId, noteIds));
        await db
          .delete(fiscalDocumentos)
          .where(inArray(fiscalDocumentos.notaFiscalId, noteIds));
      }
      if (expenseIds.length) {
        await db
          .delete(whatsappInbox)
          .where(inArray(whatsappInbox.despesaId, expenseIds));
        await db
          .delete(creditosApurados)
          .where(inArray(creditosApurados.despesaId, expenseIds));
        await db.delete(despesas).where(inArray(despesas.id, expenseIds));
      }
      if (noteIds.length)
        await db.delete(notasFiscais).where(inArray(notasFiscais.id, noteIds));
      await db.delete(nfeIoOrcamentos).where(eq(nfeIoOrcamentos.id, budget));
      if (empresa) {
        await db
          .delete(fiscalConfiguracao)
          .where(eq(fiscalConfiguracao.empresaId, empresa));
        await db
          .delete(logAuditoria)
          .where(eq(logAuditoria.empresaId, empresa));
        await db
          .delete(colaboradores)
          .where(eq(colaboradores.empresaId, empresa));
        await db.delete(empresas).where(eq(empresas.id, empresa));
      }
      if (foreignCompany) {
        await db
          .delete(colaboradores)
          .where(eq(colaboradores.empresaId, foreignCompany));
        await db.delete(empresas).where(eq(empresas.id, foreignCompany));
      }
      await db
        .delete(usuarios)
        .where(
          inArray(usuarios.id, [owner, colleague, outsider].filter(Boolean))
        );
      await pool?.end();
    });
    it("default desligado e upload conserva chave/arquivo; não consulta", async () => {
      expect(await fiscal().configuracao({ empresaId: empresa })).toMatchObject(
        { habilitada: false, versao: 0 }
      );
      const input = await upload();
      const [doc] = await db
        .select()
        .from(fiscalDocumentos)
        .where(eq(fiscalDocumentos.notaFiscalId, input.notaFiscalId));
      const [note] = await db
        .select()
        .from(notasFiscais)
        .where(eq(notasFiscais.id, input.notaFiscalId));
      expect(doc.chave).toBe(key());
      expect(doc.hash).toBe(note.arquivoChecksum);
      const result = await expenses(colleague).processarAutomatica(input);
      expenseIds.push(result.despesaId);
      expect(result.verificacaoFiscal.estado).toBe("desativada");
      expect(calls).toHaveLength(0);
      expect(
        (await expenses().get({ id: result.despesaId })).despesa
      ).toMatchObject({
        colaborador: "Fixture Colaborador",
        centroCusto: "CC-FIXTURE",
      });
    });
    it("apenas administrador altera; atualização concorrente não perde histórico", async () => {
      await expect(
        fiscal(colleague).configurar({
          empresaId: empresa,
          habilitada: true,
          versaoEsperada: 0,
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        fiscal(outsider).configuracao({ empresaId: empresa })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      const changes = await Promise.allSettled([
        fiscal().configurar({
          empresaId: empresa,
          habilitada: true,
          versaoEsperada: 0,
        }),
        fiscal().configurar({
          empresaId: empresa,
          habilitada: true,
          versaoEsperada: 0,
        }),
      ]);
      expect(changes.filter(r => r.status === "fulfilled")).toHaveLength(1);
      expect(changes.filter(r => r.status === "rejected")).toHaveLength(1);
      const config = await fiscal().configuracao({ empresaId: empresa });
      expect(config).toMatchObject({
        habilitada: true,
        versao: 1,
        alteradaPor: owner,
      });
      expect(config.historico).toHaveLength(1);
      expect(config.historico[0].usuarioId).toBe(owner);
    });
    it("65 aparece como não suportada no ID da despesa sem consumir consulta", async () => {
      const input = await upload("65");
      const result = await expenses(colleague).processarAutomatica(input);
      expenseIds.push(result.despesaId);
      expect(result.verificacaoFiscal).toMatchObject({
        estado: "nao_suportada",
        modelo: "65",
        solicitada: true,
      });
      const detail = await expenses().get({ id: result.despesaId });
      expect(detail.verificacaoFiscal?.estado).toBe("nao_suportada");
      expect(detail.despesa.status).not.toBe("aprovada");
      expect(calls).toHaveLength(0);
    });
    it("55 usa consentimento da empresa para colaborador e reserva antes da rede", async () => {
      const input = await upload();
      const result = await expenses(colleague).processarAutomatica(input);
      expenseIds.push(result.despesaId);
      expect(result.verificacaoFiscal.estado).toBe("autorizada");
      expect(calls).toHaveLength(1);
      const [row] = await db
        .select()
        .from(nfeIoConsultas)
        .where(
          and(
            eq(nfeIoConsultas.notaFiscalId, input.notaFiscalId),
            eq(nfeIoConsultas.empresaId, empresa)
          )
        );
      expect(row.usuarioId).toBe(colleague);
      expect(row.status).toBe("concluida");
      expect(
        JSON.stringify(await expenses().get({ id: result.despesaId }))
      ).not.toContain(key());
    });
    it("duas verificações concorrentes da mesma nota só reservam uma unidade", async () => {
      const input = await upload();
      const results = await Promise.all([
        verificarFiscalAntesDaDecisao(ctx(colleague), input),
        verificarFiscalAntesDaDecisao(ctx(colleague), input),
      ]);
      expect(calls).toHaveLength(2);
      expect(results.some(r => r.estado === "autorizada")).toBe(true);
      expect(
        (await verificarFiscalAntesDaDecisao(ctx(colleague), input)).estado
      ).toBe("autorizada");
      expect(calls).toHaveLength(2);
    });
    it("adulteração do arquivo não consulta e outra empresa não acessa a nota", async () => {
      const input = await upload();
      await db
        .update(notasFiscais)
        .set({ arquivoBase64: Buffer.from("adulterado").toString("base64") })
        .where(eq(notasFiscais.id, input.notaFiscalId));
      await expect(
        verificarFiscalAntesDaDecisao(ctx(outsider), input)
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(
        (await verificarFiscalAntesDaDecisao(ctx(colleague), input)).estado
      ).toBe("integridade_divergente");
      expect(calls).toHaveLength(2);
    });
    it("WhatsApp geral55 reserva fora do lock, usa ator real e conserva sombra sem jornada", async () => {
      viaWhatsapp = true;
      nextModel = "55";
      documentSequence++;
      const pedido = {
        empresaId: empresa,
        colaboradorId: targetPerson,
        mensagemId: `fiscal-whatsapp-${run}`,
        recebidoEm: new Date().toISOString(),
        comprovante: {
          arquivoNome: "fixture.pdf",
          arquivoMime: "application/pdf" as const,
          conteudo: Buffer.from(`%PDF-1.4 fixture-${run}`),
        },
        extracao: (await injected.extrair()) as OcrExtracao,
      };
      try {
        const first = await receberComprovanteWhatsapp(pedido);
        expect(first.despesaId).not.toBeNull();
        expenseIds.push(first.despesaId!);
        const [d] = await db
          .select()
          .from(despesas)
          .where(eq(despesas.id, first.despesaId!));
        noteIds.push(d.notaFiscalId);
        expect(first.situacao).toBe("em_revisao"); // Modo sombra não é promovido por sucesso fiscal.
        const [doc] = await db
          .select()
          .from(fiscalDocumentos)
          .where(eq(fiscalDocumentos.notaFiscalId, d.notaFiscalId));
        expect(doc.usuarioId).toBeNull();
        expect(doc.colaboradorId).toBe(targetPerson);
        const [execucao] = await db
          .select()
          .from(fiscalVerificacoes)
          .where(eq(fiscalVerificacoes.notaFiscalId, d.notaFiscalId));
        expect(execucao.resultado.estado).toBe("autorizada");
        expect(execucao.orcamentoId).toBe(budget);
        expect(calls).toHaveLength(3);
        const replay = await receberComprovanteWhatsapp(pedido);
        expect(replay).toMatchObject({
          despesaId: first.despesaId,
          idempotente: true,
        });
        await finalizarComprovanteFiscalWhatsapp(pedido, pedido.mensagemId);
        expect(calls).toHaveLength(3);
        const [inbox] = await db
          .select()
          .from(whatsappInbox)
          .where(eq(whatsappInbox.despesaId, d.id));
        expect(inbox.payload).toEqual({
          textoResposta: "Comprovante Recebido!",
          fiscalPendente: false,
        });
      } finally {
        viaWhatsapp = false;
      }
    });
    it("WhatsApp geral65 persiste não suportada sem consumir saldo ou inventar usuário", async () => {
      nextModel = "65";
      documentSequence++;
      const pedido = {
        empresaId: empresa,
        colaboradorId: targetPerson,
        mensagemId: `fiscal-whatsapp65-${run}`,
        recebidoEm: new Date().toISOString(),
        comprovante: {
          arquivoNome: "fixture65.pdf",
          arquivoMime: "application/pdf" as const,
          conteudo: Buffer.from(`%PDF-1.4 fixture65-${run}`),
        },
        extracao: (await injected.extrair()) as OcrExtracao,
      };
      const result = await receberComprovanteWhatsapp(pedido);
      expenseIds.push(result.despesaId!);
      const [d] = await db
        .select()
        .from(despesas)
        .where(eq(despesas.id, result.despesaId!));
      noteIds.push(d.notaFiscalId);
      const [execucao] = await db
        .select()
        .from(fiscalVerificacoes)
        .where(eq(fiscalVerificacoes.notaFiscalId, d.notaFiscalId));
      expect(execucao.resultado).toMatchObject({
        estado: "nao_suportada",
        modelo: "65",
      });
      expect(execucao.orcamentoId).toBeNull();
      expect(calls).toHaveLength(3);
      expect(d.status).toBe("em_revisao");
    });
    it("FKs impedem nota e colaborador de outra empresa nas tabelas fiscais", async () => {
      const [n] = await db.insert(notasFiscais).values({ empresaId: empresa, arquivoNome: "fixture-fk" });
      noteIds.push(n.insertId);
      const documento = { notaFiscalId: n.insertId, empresaId: empresa, usuarioId: owner, hash: "a".repeat(64), chaveEstado: "ausente" };
      await expect(db.insert(fiscalDocumentos).values({ ...documento, empresaId: foreignCompany })).rejects.toMatchObject({ cause: { code: "ER_NO_REFERENCED_ROW_2" } });
      await expect(db.insert(fiscalDocumentos).values({ ...documento, colaboradorId: foreignPerson })).rejects.toMatchObject({ cause: { code: "ER_NO_REFERENCED_ROW_2" } });
      const verificacao = { notaFiscalId: n.insertId, empresaId: empresa, usuarioId: owner, id: randomUUID(), resultado: { estado: "desativada" as const, solicitada: false, configuracaoVersao: 0, consultaId: null, modelo: null, verificadaEm: null } };
      await expect(db.insert(fiscalVerificacoes).values({ ...verificacao, empresaId: foreignCompany })).rejects.toMatchObject({ cause: { code: "ER_NO_REFERENCED_ROW_2" } });
      await expect(db.insert(fiscalVerificacoes).values({ ...verificacao, colaboradorId: foreignPerson })).rejects.toMatchObject({ cause: { code: "ER_NO_REFERENCED_ROW_2" } });
    });
    it("admin sem vínculo não vira solicitante e campos de terceiro não herdam seu CC", async () => {
      expect(await identificarSolicitanteWeb(ctx(owner), empresa)).toEqual({
        colaborador: null,
        centroCusto: null,
      });
      expect(
        await identificarSolicitanteWeb(ctx(colleague), empresa, {
          colaborador: "Terceiro explícito",
        })
      ).toEqual({ colaborador: "Terceiro explícito", centroCusto: null });
      expect(
        await identificarSolicitanteWeb(ctx(colleague), empresa, {
          colaborador: "Terceiro explícito",
          centroCusto: "CC-EXPLICITO",
        })
      ).toEqual({
        colaborador: "Terceiro explícito",
        centroCusto: "CC-EXPLICITO",
      });
    });
    it("vínculo ambíguo não é inferido pelo primeiro registro", async () => {
      const [extra] = await db.insert(colaboradores).values({
        empresaId: empresa,
        usuarioId: colleague,
        nome: "Fixture vínculo duplicado",
        statusVinculo: "ativo",
      });
      try {
        expect(
          await identificarSolicitanteWeb(ctx(colleague), empresa)
        ).toEqual({ colaborador: null, centroCusto: null });
      } finally {
        await db
          .delete(colaboradores)
          .where(eq(colaboradores.id, extra.insertId));
      }
    });
    it("correção auditada restringe papel, tenant e valores anteriores", async () => {
      const despesaId = expenseIds[0];
      const original = (await expenses().get({ id: despesaId })).despesa;
      const input = {
        empresaId: empresa,
        despesaId,
        colaboradorId: targetPerson,
        motivo: "Identificado pelo documento de suporte",
        colaboradorAtual: original.colaborador,
        centroCustoAtual: original.centroCusto,
      };
      expect(
        await expenses(colleague).identificacao.opcoes({
          empresaId: empresa,
          despesaId,
        })
      ).toMatchObject({ permitido: false });
      await expect(
        expenses(colleague).identificacao.corrigir(input)
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      const options = await expenses().identificacao.opcoes({
        empresaId: empresa,
        despesaId,
      });
      expect(options.colaboradores.map(p => p.id)).not.toContain(foreignPerson);
      await expect(
        expenses().identificacao.corrigir({
          ...input,
          colaboradorId: foreignPerson,
        })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(await expenses().identificacao.corrigir(input)).toMatchObject({
        colaborador: "Fixture Solicitante Selecionado",
        centroCusto: "CC-SELECIONADO",
      });
      await expect(
        expenses().identificacao.corrigir(input)
      ).rejects.toMatchObject({ code: "CONFLICT" });
      const [audit] = await db
        .select()
        .from(logAuditoria)
        .where(
          and(
            eq(logAuditoria.empresaId, empresa),
            eq(logAuditoria.acao, "despesa.identificar_colaborador")
          )
        );
      expect(audit.usuarioId).toBe(owner);
      expect(JSON.parse(audit.detalhes!).colaboradorId).toBe(targetPerson);
      expect(JSON.parse(audit.detalhes!).anterior.colaborador).toBe(
        original.colaborador
      );
      const corrected = (await expenses().get({ id: despesaId })).despesa;
      await db
        .update(despesas)
        .set({ status: "aprovada" })
        .where(eq(despesas.id, despesaId));
      await expect(
        expenses().identificacao.corrigir({
          ...input,
          colaboradorAtual: corrected.colaborador,
          centroCustoAtual: corrected.centroCusto,
        })
      ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    });
  }
);

import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPool, type Pool } from "mysql2/promise";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import { eq, inArray } from "drizzle-orm";
import { colaboradores, creditosApurados, despesas, empresas, logAuditoria, notasFiscais, usuarios, whatsappInbox } from "./schema";
import { fiscalDocumentos, fiscalVerificacoes } from "./fiscalSchema";
import type { OcrExtracao } from "../contracts/types";
import type { ResultadoVerificacaoFiscal } from "../contracts/fiscal";

const injected = vi.hoisted(() => ({ db: undefined as unknown, extrair: vi.fn(), verificar: vi.fn(), falharLog: false }));
vi.mock("../api/queries/connection", () => ({ getDb: () => injected.db }));
vi.mock("../api/modules/fiscal/ocr", () => ({ getOcrProvider: () => ({ nome: "fixture", extrair: injected.extrair }) }));
vi.mock("../api/modules/fiscal/verificacao/service", async importOriginal => ({
  ...await importOriginal<typeof import("../api/modules/fiscal/verificacao/service")>(),
  verificarFiscalWhatsapp: injected.verificar,
}));
vi.mock("../api/routers/_shared", async importOriginal => {
  const original = await importOriginal<typeof import("../api/routers/_shared")>();
  return { ...original, registrarLog: async (...args: Parameters<typeof original.registrarLog>) => {
    if (injected.falharLog && args[1].acao === "nota.upload") throw new Error("Falha de auditoria sintética");
    return original.registrarLog(...args);
  } };
});
import { despesasRouter } from "../api/routers/despesas";
import { receberComprovanteWhatsapp } from "../api/modules/reembolso/whatsapp/comprovanteDb";

// Nunca usa DATABASE_URL nem lê .env; o operador instala o schema previamente.
const raw = process.env.POC_TEST_DATABASE_URL;
const target = raw ? new URL(raw) : null;
if (target && (target.protocol !== "mysql:" || !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname)
  || !/^\/reembolsa_poc_test_[a-zA-Z0-9_]+$/.test(target.pathname) || target.search || target.hash)) {
  throw new Error("Use banco local isolado reembolsa_poc_test_*");
}
const desativada: ResultadoVerificacaoFiscal = { estado: "desativada", solicitada: false, configuracaoVersao: 0, consultaId: null, modelo: null, verificadaEm: null };
type Fixture = { usuarioId: number; empresaId: number; colaboradorId: number };
type Barreira = { chegadas: number; esperar: Promise<void>; liberar: () => void };
let db: MySql2Database, pool: Pool, barreira: Barreira | null = null;
const companyIds: number[] = [], userIds: number[] = [];
let sequencia = 0;
function chaveValida() {
  const base = `3526091420016600016655001${String(++sequencia).padStart(9, "0")}100000000`;
  const soma = [...base].reverse().reduce((total, digito, indice) => total + Number(digito) * (2 + indice % 8), 0);
  const dv = 11 - soma % 11;
  return base + (dv >= 10 ? 0 : dv);
}
function extracao(chave: string | null): OcrExtracao {
  return { chaveAcesso: chave, cnpjEmitente: "14200166000166", cfop: null, ncm: null, cst: null,
    valor: 30, dataFatoGerador: "2026-09-15", litros: null, categoriaSugerida: "alimentacao",
    confiancaExtracao: "alta", camposPendentes: [], provedor: "fixture", avisos: [], tipoDocumento: "nota_fiscal", confiancaTipo: "alta" };
}
function arquivo() {
  // PDF sintético local; bytes distintos por caso, sem conteúdo pessoal.
  return Buffer.from(`%PDF-1.4\n% fixture-${randomUUID()}\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF`);
}
async function fixture(): Promise<Fixture> {
  const [user] = await db.insert(usuarios).values({ nome: "Fixture canais SQL", email: `${randomUUID()}@example.invalid`, senhaHash: "fixture-sem-login", perfil: "cliente" });
  userIds.push(user.insertId);
  const [company] = await db.insert(empresas).values({ usuarioId: user.insertId, razaoSocial: "Fixture canais SQL", cnpj: "99887766000155", cnaePrincipal: "6201501", regimeTributario: "simples_nacional", uf: "SP" });
  companyIds.push(company.insertId);
  const [person] = await db.insert(colaboradores).values({ empresaId: company.insertId, nome: "Pessoa sintética", statusVinculo: "ativo" });
  return { usuarioId: user.insertId, empresaId: company.insertId, colaboradorId: person.insertId };
}
function web(f: Fixture, conteudo: Buffer) {
  const caller = despesasRouter.createCaller({ req: new Request("http://localhost"), resHeaders: new Headers(),
    usuario: { id: f.usuarioId, nome: "Fixture canais SQL", email: "fixture@example.invalid", perfil: "cliente" } });
  return caller.uploadNota({ empresaId: f.empresaId, arquivoNome: "fixture.pdf", arquivoMime: "application/pdf", arquivoBase64: conteudo.toString("base64") });
}
function whatsapp(f: Fixture, conteudo: Buffer, chave: string | null = null, mensagemId = `wamid.fixture.${randomUUID()}`) {
  return receberComprovanteWhatsapp({ empresaId: f.empresaId, colaboradorId: f.colaboradorId, mensagemId,
    recebidoEm: new Date().toISOString(), comprovante: { arquivoNome: "fixture.pdf", arquivoMime: "application/pdf", conteudo }, extracao: extracao(chave) });
}
async function concorrentes<A, B>(a: () => Promise<A>, b: () => Promise<B>) {
  let liberar!: () => void;
  const esperar = new Promise<void>(resolve => { liberar = resolve; });
  const ativa = { chegadas: 0, esperar, liberar };
  barreira = ativa;
  // Libera em falhas de pré-condição para não deixar uma conexão pendurada.
  const timeout = setTimeout(liberar, 3000);
  try {
    const result = await Promise.allSettled([a(), b()]);
    expect(ativa.chegadas).toBe(2);
    return result;
  } finally { clearTimeout(timeout); liberar(); barreira = null; }
}
async function documentos(f: Fixture) {
  return {
    notas: await db.select().from(notasFiscais).where(eq(notasFiscais.empresaId, f.empresaId)),
    identidades: await db.select().from(fiscalDocumentos).where(eq(fiscalDocumentos.empresaId, f.empresaId)),
    despesas: await db.select().from(despesas).where(eq(despesas.empresaId, f.empresaId)),
    inbox: await db.select().from(whatsappInbox).where(eq(whatsappInbox.empresaId, f.empresaId)),
  };
}
function umVencedor(results: PromiseSettledResult<unknown>[]) {
  expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
  const rejeicoes = results.filter(result => result.status === "rejected");
  expect(rejeicoes).toHaveLength(1);
  const erro = (rejeicoes[0] as PromiseRejectedResult).reason;
  expect(erro.message).toBe("Este comprovante já foi registrado na empresa.");
  expect(erro.code === "CONFLICT" || erro.codigo === "DUPLICADO").toBe(true);
  expect(erro.notaFiscalId).toBeUndefined();
  expect(erro.despesaId).toBeUndefined();
}

describe.skipIf(!target)("documentos SQL: concorrência real web e WhatsApp", () => {
  beforeAll(async () => {
    pool = createPool({ uri: target!.href, connectionLimit: 6, timezone: "Z" });
    const [actual] = await pool.query("SELECT DATABASE() AS nome");
    if ((actual as { nome: string }[])[0].nome !== target!.pathname.slice(1)) throw new Error("Banco divergente");
    db = drizzle(pool);
    // Apenas sincroniza BEGIN das duas primeiras transações. SELECT FOR UPDATE,
    // concorrência, rollback, FK e inserts são todos executados pelo banco real.
    injected.db = new Proxy(db, { get(original, property) {
      if (property === "transaction") return async (...args: Parameters<MySql2Database["transaction"]>) => original.transaction(async tx => {
        const atual = barreira;
        if (atual && atual.chegadas < 2) {
          atual.chegadas++;
          if (atual.chegadas === 2) atual.liberar();
          await atual.esperar;
        }
        return args[0](tx);
      }, args[1]);
      const value = Reflect.get(original, property);
      return typeof value === "function" ? value.bind(original) : value;
    } });
    vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Rede proibida nesta suíte SQL"); }));
  });
  beforeEach(() => {
    injected.falharLog = false;
    injected.extrair.mockReset().mockResolvedValue(extracao(null));
    injected.verificar.mockReset().mockResolvedValue(desativada);
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    if (!db) return;
    try {
      if (companyIds.length) {
        const notes = await db.select({ id: notasFiscais.id }).from(notasFiscais).where(inArray(notasFiscais.empresaId, companyIds));
        const expenses = await db.select({ id: despesas.id }).from(despesas).where(inArray(despesas.empresaId, companyIds));
        if (notes.length) {
          await db.delete(fiscalVerificacoes).where(inArray(fiscalVerificacoes.notaFiscalId, notes.map(note => note.id)));
          await db.delete(fiscalDocumentos).where(inArray(fiscalDocumentos.notaFiscalId, notes.map(note => note.id)));
        }
        await db.delete(whatsappInbox).where(inArray(whatsappInbox.empresaId, companyIds));
        if (expenses.length) await db.delete(creditosApurados).where(inArray(creditosApurados.despesaId, expenses.map(expense => expense.id)));
        await db.delete(despesas).where(inArray(despesas.empresaId, companyIds));
        await db.delete(notasFiscais).where(inArray(notasFiscais.empresaId, companyIds));
        await db.delete(logAuditoria).where(inArray(logAuditoria.empresaId, companyIds));
        await db.delete(colaboradores).where(inArray(colaboradores.empresaId, companyIds));
        await db.delete(empresas).where(inArray(empresas.id, companyIds));
      }
      if (userIds.length) await db.delete(usuarios).where(inArray(usuarios.id, userIds));
    } finally { await pool.end(); }
  });

  it("mesmo binário concorrente nos dois canais persiste somente uma nota e identidade", async () => {
    const f = await fixture(), bytes = arquivo();
    umVencedor(await concorrentes(() => web(f, bytes), () => whatsapp(f, bytes)));
    const rows = await documentos(f);
    expect(rows.notas).toHaveLength(1); expect(rows.identidades).toHaveLength(1);
    expect(rows.identidades[0].notaFiscalId).toBe(rows.notas[0].id);
    expect(rows.identidades[0].hash).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(rows.despesas.length).toBeLessThanOrEqual(1);
  });
  it("arquivos distintos com a mesma chave válida concorrem pela mesma identidade fiscal", async () => {
    const f = await fixture(), chave = chaveValida(), webBytes = arquivo(), whatsappBytes = arquivo();
    expect(chave).toHaveLength(44);
    injected.extrair.mockResolvedValue(extracao(chave));
    umVencedor(await concorrentes(() => web(f, webBytes), () => whatsapp(f, whatsappBytes, chave)));
    const rows = await documentos(f);
    expect(rows.notas).toHaveLength(1); expect(rows.identidades).toHaveLength(1);
    expect(rows.identidades[0].chave).toBe(chave);
    expect(rows.identidades[0].chaveEstado).toBe("valida");
    expect(rows.despesas.length).toBeLessThanOrEqual(1);
  });
  it("mesmo binário e chave em empresas distintas não bloqueiam nem misturam os documentos", async () => {
    const a = await fixture(), b = await fixture(), bytes = arquivo(), chave = chaveValida();
    injected.extrair.mockResolvedValue(extracao(chave));
    const results = await concorrentes(() => web(a, bytes), () => whatsapp(b, bytes, chave));
    expect(results.every(result => result.status === "fulfilled")).toBe(true);
    const left = await documentos(a), right = await documentos(b);
    for (const rows of [left, right]) { expect(rows.notas).toHaveLength(1); expect(rows.identidades).toHaveLength(1); }
    expect(left.notas[0].id).not.toBe(right.notas[0].id);
    expect(left.identidades[0]).toMatchObject({ empresaId: a.empresaId, notaFiscalId: left.notas[0].id, usuarioId: a.usuarioId, colaboradorId: null });
    expect(right.identidades[0]).toMatchObject({ empresaId: b.empresaId, notaFiscalId: right.notas[0].id, usuarioId: null, colaboradorId: b.colaboradorId });
  });
  it("mensagem WhatsApp repetida simultaneamente retorna mesma despesa sem duplicar efeito", async () => {
    const f = await fixture(), bytes = arquivo(), mensagem = `wamid.fixture.${randomUUID()}`;
    const results = await concorrentes(() => whatsapp(f, bytes, null, mensagem), () => whatsapp(f, bytes, null, mensagem));
    expect(results.every(result => result.status === "fulfilled")).toBe(true);
    const replies = results.map(result => (result as PromiseFulfilledResult<Awaited<ReturnType<typeof whatsapp>>>).value);
    expect(replies[0].despesaId).toBe(replies[1].despesaId);
    expect(replies.filter(reply => reply.idempotente)).toHaveLength(1);
    const rows = await documentos(f);
    expect(rows.notas).toHaveLength(1); expect(rows.identidades).toHaveLength(1);
    expect(rows.despesas).toHaveLength(1); expect(rows.inbox).toHaveLength(1);
    const decisions = await db.select().from(logAuditoria).where(eq(logAuditoria.empresaId, f.empresaId));
    expect(decisions.filter(log => log.acao === "despesa.decisao")).toHaveLength(1);
  });
  it("replay da mensagem por outra empresa é recusado sem expor ID do registro alheio", async () => {
    const a = await fixture(), b = await fixture(), bytes = arquivo(), mensagem = `wamid.fixture.${randomUUID()}`;
    await whatsapp(a, bytes, null, mensagem);
    await expect(whatsapp(b, bytes, null, mensagem)).rejects.toMatchObject({ codigo: "VINCULO_INVALIDO", message: "Vínculo inválido" });
    const right = await documentos(b);
    expect(right.notas).toHaveLength(0); expect(right.identidades).toHaveLength(0); expect(right.despesas).toHaveLength(0); expect(right.inbox).toHaveLength(0);
    expect((await documentos(a)).despesas).toHaveLength(1);
  });
  it("falha no log de upload reverte nota e identidade antes do retry", async () => {
    const f = await fixture(), bytes = arquivo();
    injected.falharLog = true;
    const silence = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try { await expect(web(f, bytes)).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" }); }
    finally { silence.mockRestore(); }
    const failed = await documentos(f);
    expect(failed.notas).toHaveLength(0); expect(failed.identidades).toHaveLength(0);
    expect(await db.select().from(logAuditoria).where(eq(logAuditoria.empresaId, f.empresaId))).toHaveLength(0);
    injected.falharLog = false;
    await expect(web(f, bytes)).resolves.toMatchObject({ notaFiscalId: expect.any(Number) });
    const retried = await documentos(f);
    expect(retried.notas).toHaveLength(1); expect(retried.identidades).toHaveLength(1);
    const logs = await db.select().from(logAuditoria).where(eq(logAuditoria.empresaId, f.empresaId));
    expect(logs.filter(log => log.acao === "nota.upload")).toHaveLength(1);
  });
});

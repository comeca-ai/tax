import { beforeEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import type { SQL } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { empresas, notasFiscais } from "../../db/schema";
import { fiscalDocumentos } from "../../db/fiscalSchema";

const mocks = vi.hoisted(() => ({ db: vi.fn(), autorizar: vi.fn(), extrair: vi.fn(), log: vi.fn() }));
vi.mock("../queries/connection", () => ({ getDb: mocks.db }));
vi.mock("./_shared", async importOriginal => ({ ...await importOriginal<typeof import("./_shared")>(), assertEmpresaAcesso: mocks.autorizar, registrarLog: mocks.log }));
vi.mock("../modules/fiscal/ocr", () => ({ getOcrProvider: () => ({ extrair: mocks.extrair }) }));
import { despesasRouter } from "./despesas";

type Nota = { id: number; empresaId: number; arquivoChecksum: string };
type Documento = { notaFiscalId: number; empresaId: number; hash: string; chave: string | null };
const dialect = new MySqlDialect();
let notas: Nota[];
let documentos: Documento[];
let falharIdentidade: boolean;
let seq: number;
const locks = new Map<number, Promise<void>>();
const input = { empresaId: 42, arquivoNome: "fixture.pdf", arquivoMime: "application/pdf", arquivoBase64: Buffer.from("%PDF-comprovante-sintetico").toString("base64") };
const caller = () => despesasRouter.createCaller({ req: new Request("http://localhost"), resHeaders: new Headers(), usuario: { id: 7, nome: "Pessoa", email: "pessoa@example.invalid", perfil: "cliente" } });
function chave() {
  const base = "3526091420016600016655001000000007100000000";
  const sum = [...base].reverse().reduce((s, d, i) => s + Number(d) * (2 + i % 8), 0);
  const dv = 11 - sum % 11;
  return base + (dv >= 10 ? 0 : dv);
}

beforeEach(() => {
  vi.resetAllMocks(); notas = []; documentos = []; locks.clear(); seq = 0; falharIdentidade = false;
  mocks.autorizar.mockResolvedValue({ id: 42 });
  mocks.extrair.mockResolvedValue({ chaveAcesso: null, camposPendentes: [], confiancaExtracao: "alta", provedor: "fixture" });
  mocks.db.mockReturnValue({ transaction: async (fn: (tx: unknown) => unknown) => {
    let release: (() => void) | undefined;
    let empresaTravada: number | undefined;
    const inseridas: number[] = [];
    const tx = {
      select: () => ({ from: (table: unknown) => ({ where: (condition: SQL) => {
        const params = dialect.sqlToQuery(condition).params;
        const query = { limit: () => query, for: async (modo: string) => {
          expect(modo).toBe("update");
          const empresaId = params[0] as number;
          if (table === empresas) {
            const previous = locks.get(empresaId) ?? Promise.resolve();
            const next = new Promise<void>(resolve => { release = resolve; });
            locks.set(empresaId, previous.then(() => next));
            await previous;
            empresaTravada = empresaId;
            return [{ id: empresaId }];
          }
          expect(empresaTravada).toBe(empresaId);
          if (table === notasFiscais) return notas.filter(n => n.empresaId === empresaId && n.arquivoChecksum === params[1]);
          if (table === fiscalDocumentos) return documentos.filter(d => d.empresaId === empresaId && d.chave === params[1]);
          throw new Error("Consulta inesperada");
        } };
        return query;
      } }) }),
      insert: (table: unknown) => ({ values: async (value: Record<string, unknown>) => {
        expect(value.empresaId).toBe(empresaTravada);
        if (table === notasFiscais) {
          const id = ++seq; inseridas.push(id); notas.push({ ...value, id } as Nota); return [{ insertId: id }];
        }
        if (table === fiscalDocumentos) {
          if (falharIdentidade) throw new Error("identidade indisponível");
          documentos.push(value as Documento); return [{ affectedRows: 1 }];
        }
        throw new Error("Escrita inesperada");
      } }),
    };
    try { return await fn(tx); }
    catch (error) { notas = notas.filter(n => !inseridas.includes(n.id)); documentos = documentos.filter(d => !inseridas.includes(d.notaFiscalId)); throw error; }
    finally { release?.(); }
  } });
});

describe("upload web deduplica documento antes de disponibilizar outra nota", () => {
  it("mesmo binário repetido recebe conflito sem expor ID nem criar outra nota", async () => {
    await caller().uploadNota(input);
    await expect(caller().uploadNota(input)).rejects.toMatchObject({ code: "CONFLICT", message: "Este comprovante já foi registrado na empresa." });
    expect(notas).toHaveLength(1); expect(documentos).toHaveLength(1); expect(mocks.log).toHaveBeenCalledOnce();
  });
  it("arquivo diferente com a mesma chave válida é bloqueado", async () => {
    mocks.extrair.mockResolvedValue({ chaveAcesso: chave(), camposPendentes: [], provedor: "fixture" });
    await caller().uploadNota(input);
    expect(documentos[0].chave).toHaveLength(44);
    await expect(caller().uploadNota({ ...input, arquivoBase64: Buffer.from("%PDF-outros-pixels").toString("base64") })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(notas).toHaveLength(1);
  });
  it("envios concorrentes do mesmo binário produzem apenas uma nota", async () => {
    const results = await Promise.allSettled([caller().uploadNota(input), caller().uploadNota(input)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
    expect(notas).toHaveLength(1); expect(documentos).toHaveLength(1);
  });
  it("a mesma chave em empresa diferente não revela nem bloqueia documento alheio", async () => {
    mocks.extrair.mockResolvedValue({ chaveAcesso: chave(), camposPendentes: [], provedor: "fixture" });
    await caller().uploadNota(input);
    await caller().uploadNota({ ...input, empresaId: 43 });
    expect(notas).toHaveLength(2); expect(documentos.map(d => d.empresaId)).toEqual([42, 43]);
  });
  it("chave inválida não bloqueia documentos diferentes nem é persistida", async () => {
    mocks.extrair.mockResolvedValue({ chaveAcesso: "invalida", camposPendentes: [], provedor: "fixture" });
    await caller().uploadNota(input);
    await caller().uploadNota({ ...input, arquivoBase64: Buffer.from("%PDF-outra-nota").toString("base64") });
    expect(notas).toHaveLength(2); expect(documentos.every(d => d.chave === null)).toBe(true);
  });
  it("documento previamente recebido por outro canal também bloqueia upload web", async () => {
    const { identidadeFiscalDoUpload } = await import("../modules/fiscal/verificacao/documento");
    notas.push({ id: 700, empresaId: 42, arquivoChecksum: identidadeFiscalDoUpload(input.arquivoBase64).hash });
    await expect(caller().uploadNota(input)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(notas).toHaveLength(1); expect(documentos).toHaveLength(0);
  });
  it("falha ao persistir identidade reverte a nota e permite nova tentativa", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    falharIdentidade = true;
    await expect(caller().uploadNota(input)).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(notas).toHaveLength(0);
    falharIdentidade = false;
    await caller().uploadNota(input);
    expect(notas).toHaveLength(1); expect(documentos).toHaveLength(1);
    quiet.mockRestore();
  });
  it("empresa não autorizada é recusada antes de OCR e acesso documental", async () => {
    mocks.autorizar.mockRejectedValue(new TRPCError({ code: "FORBIDDEN" }));
    await expect(caller().uploadNota(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.extrair).not.toHaveBeenCalled(); expect(mocks.db).not.toHaveBeenCalled();
  });
  it("falha no log reverte upload e identidade para permitir retry", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.log.mockRejectedValueOnce(new Error("auditoria indisponível"));
    await expect(caller().uploadNota(input)).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(notas).toHaveLength(0);
    expect(documentos).toHaveLength(0);
    await expect(caller().uploadNota(input)).resolves.toHaveProperty("notaFiscalId");
    expect(notas).toHaveLength(1);
    expect(documentos).toHaveLength(1);
    quiet.mockRestore();
  });
});

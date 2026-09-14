import { historicoDecisoesDespesa, registrarDecisaoDespesa } from "../api/modules/reembolso/decisoes/registro";
import { revisaoRouter } from "../api/routers/revisao";
import { metadadosDespesasWhatsapp } from "../api/modules/reembolso/whatsapp/metadadosDespesa";
import { incluirConvidadosPermitidos } from "../api/modules/reembolso/whatsapp/convidadosPermitidos";
import { Hono } from "hono";
import { exigirServicoAutenticado, type ServicoEnv } from "../api/modules/reembolso/whatsapp/servicoAuth";
import { criarRouterIdentificacaoWhatsapp } from "../api/modules/reembolso/whatsapp/identificacao";
import { criarRouterComprovanteWhatsapp } from "../api/modules/reembolso/whatsapp/comprovanteRouter";
import { resolverColaboradoresPorTelefone } from "../api/modules/reembolso/whatsapp/identificacaoDb";
import { assertEmpresaAcesso, papelRevisaoNaEmpresa, ehDesignadoDeAlgumaEmpresa } from "../api/routers/_shared";
import { empresasRouter } from "../api/modules/empresas";
import { receberComprovanteWhatsapp } from "../api/modules/reembolso/whatsapp/comprovanteDb";
import { regrasPoliticaSchema } from "../contracts/types";
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createPool, type Pool } from "mysql2/promise";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import { and, eq, inArray } from "drizzle-orm";
import * as schema from "./schema";
import * as poc from "./pocSchema";
import { fiscalDocumentos, fiscalVerificacoes } from "./fiscalSchema";
import * as relations from "./relations";
import { alterarCampo, registrarEventoCampo, interpretarMensagemCampo } from "../api/modules/reembolso/campo/servico";
import { importarDocumentoCampo, type ExtracaoCombustivel } from "../api/modules/reembolso/campo/documentos";
import { veiculosRouter } from "../api/routers/veiculos";
import { campoRouter } from "../api/routers/campo";
import { novoEstadoCampo } from "../api/modules/reembolso/campo/dominio";
import type { ConfiguracaoCampo } from "../api/modules/reembolso/campo/politica";
import { calcularJornadaPersistida } from "../api/modules/reembolso/campo/calculoMaps";
import { enfileirarConfirmacoesComprovante, enviarProximaRespostaWhatsapp } from "../api/modules/reembolso/whatsapp/worker";
import * as dialogTransport from "../api/modules/reembolso/whatsapp/dialog360Transport";

const injected = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("../api/queries/connection", () => ({ getDb: () => {
  if (!injected.db) throw new Error("Banco de teste não inicializado.");
  return injected.db;
} }));

/** Este é o ÚNICO endereço lido. Não usa DATABASE_URL, .env ou config operacional. */
const testUrl = process.env.POC_TEST_DATABASE_URL;
function validarBancoTeste(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("POC_TEST_DATABASE_URL inválida."); }
  if (url.protocol !== "mysql:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || !/^\/reembolsa_poc_test_[a-zA-Z0-9_]+$/.test(url.pathname) || url.search || url.hash) {
    throw new Error("Testes SQL exigem localhost e banco reembolsa_poc_test_* dedicado, sem parâmetros na URL.");
  }
  return { uri: value, database: url.pathname.slice(1) };
}
// URL fornecida mas inválida falha, nunca se torna um skip silencioso.
const target = testUrl ? validarBancoTeste(testUrl) : null;
const fullSchema = { ...schema, ...poc, ...relations };
type Db = MySql2Database<typeof fullSchema>;
let db: Db;
let pool: Pool | undefined;
const run = randomUUID();
const ids = { usuarios: [] as number[], empresas: [] as number[], pessoas: [] as number[], veiculos: [] as number[], politicas: [] as number[], notas: [] as number[], despesas: [] as number[], inbox: [] as number[], documentos: [] as string[] };
let usuarioA: number, usuarioB: number, empresaA: number, empresaB: number, pessoaA: number, pessoaA2: number, pessoaB: number;
let despesaPendente: number, despesaAprovada: number;
const placa = `T${run.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
const identity = () => ({ empresaId: empresaA, colaboradorId: pessoaA });

function caller(usuarioId: number) {
  return campoRouter.createCaller({ req: new Request("http://localhost/test"), resHeaders: new Headers(), usuario: { id: usuarioId, nome: "Fixture SQL", email: `fixture-${usuarioId}@example.invalid`, perfil: "cliente" } });
}

describe.skipIf(!target)("POC — integração MySQL/MariaDB isolada", () => {
  beforeAll(async () => {
    pool = createPool({ uri: target!.uri, connectionLimit: 5, timezone: "Z" });
    // Valida banco efetivo ANTES de qualquer escrita, mesmo que o servidor redirecione.
    const [names] = await pool.query("SELECT DATABASE() AS nome");
    if ((names as { nome: string }[])[0]?.nome !== target!.database) throw new Error("Banco efetivo diverge do banco isolado autorizado.");
    db = drizzle(pool, { schema: fullSchema, mode: "default" });
    injected.db = db;
    // Não executa migração/DDL. Root deve aplicar o schema previamente.
    await db.select().from(poc.pocConfiguracao).limit(0);
    const addUser = async () => {
      const [r] = await db.insert(schema.usuarios).values({ email: `${randomUUID()}@example.invalid`, nome: "Fixture POC SQL", senhaHash: "fixture-sem-login-valido", perfil: "cliente" });
      ids.usuarios.push(r.insertId); return r.insertId;
    };
    usuarioA = await addUser(); usuarioB = await addUser();
    const addEmpresa = async (usuarioId: number) => {
      const [r] = await db.insert(schema.empresas).values({ usuarioId, razaoSocial: `Fixture ${run}`, cnpj: "12345678000123", cnaePrincipal: "1234567", regimeTributario: "simples_nacional", uf: "SP" });
      ids.empresas.push(r.insertId); return r.insertId;
    };
    empresaA = await addEmpresa(usuarioA); empresaB = await addEmpresa(usuarioB);
    const addPessoa = async (empresaId: number) => {
      const [r] = await db.insert(schema.colaboradores).values({ empresaId, nome: "Pessoa sintética", statusVinculo: "ativo" });
      ids.pessoas.push(r.insertId); return r.insertId;
    };
    pessoaA = await addPessoa(empresaA); pessoaA2 = await addPessoa(empresaA); pessoaB = await addPessoa(empresaB);
    await db.insert(poc.pocCampo).values({ empresaId: empresaA, colaboradorId: pessoaA, estado: novoEstadoCampo() });
    const [v] = await db.insert(schema.veiculos).values({ empresaId: empresaA, placa, kmPorLitroDeclarado: 10 }); ids.veiculos.push(v.insertId);
    const [p] = await db.insert(schema.politicasReembolso).values({ empresaId: empresaA, arquivoNome: "fixture.txt", regras: {}, status: "ativa", versao: 1, createdById: usuarioA }); ids.politicas.push(p.insertId);
    const config: ConfiguracaoCampo = { modo: "sombra", politicaId: p.insertId, politicaVersao: 1, tarifaCentavosPorKm: 75, periodoDias: 7, prazoNotaDias: 1, intervaloLembreteDias: 1, limiteLembretes: 2, regraPercurso: "Regra sintética exclusiva de teste", retencaoLocalizacaoDias: 1 };
    await db.insert(poc.pocConfiguracao).values({ empresaId: empresaA, configuracao: config, historico: [] });
    const addDespesa = async (status: "pendente" | "aprovada") => {
      const [n] = await db.insert(schema.notasFiscais).values({ empresaId: empresaA, arquivoNome: "fixture.txt" }); ids.notas.push(n.insertId);
      const [d] = await db.insert(schema.despesas).values({ empresaId: empresaA, notaFiscalId: n.insertId, status }); ids.despesas.push(d.insertId); return d.insertId;
    };
    despesaPendente = await addDespesa("pendente"); despesaAprovada = await addDespesa("aprovada");
  }, 30_000);

  afterAll(async () => {
    try {
      if (!db) return;
      // Somente IDs criados por ESTE processo. Nunca TRUNCATE/DROP/DELETE global.
      if (ids.notas.length) {
        await db.delete(fiscalVerificacoes).where(inArray(fiscalVerificacoes.notaFiscalId, ids.notas));
        await db.delete(fiscalDocumentos).where(inArray(fiscalDocumentos.notaFiscalId, ids.notas));
      }
      if (ids.documentos.length) await db.delete(poc.pocDocumentos).where(inArray(poc.pocDocumentos.id, ids.documentos));
      if (ids.pessoas.length) {
        await db.delete(poc.pocDocumentos).where(inArray(poc.pocDocumentos.colaboradorId, ids.pessoas));
        await db.delete(poc.pocCampo).where(inArray(poc.pocCampo.colaboradorId, ids.pessoas));
      }
      if (ids.despesas.length) await db.delete(poc.pocPagamentos).where(inArray(poc.pocPagamentos.despesaId, ids.despesas));
      if (ids.inbox.length) await db.delete(schema.whatsappInbox).where(inArray(schema.whatsappInbox.id, ids.inbox));
      if (ids.pessoas.length) await db.delete(schema.whatsappOutbox).where(inArray(schema.whatsappOutbox.colaboradorId, ids.pessoas));
      if (ids.despesas.length) await db.delete(schema.delegacoesDecisao).where(inArray(schema.delegacoesDecisao.despesaId, ids.despesas));
      if (ids.despesas.length) await db.delete(schema.despesas).where(inArray(schema.despesas.id, ids.despesas));
      if (ids.notas.length) await db.delete(schema.notasFiscais).where(inArray(schema.notasFiscais.id, ids.notas));
      if (ids.empresas.length) await db.delete(schema.empresasConfig).where(inArray(schema.empresasConfig.empresaId, ids.empresas));
      if (ids.empresas.length) await db.delete(poc.pocConfiguracao).where(inArray(poc.pocConfiguracao.empresaId, ids.empresas));
      if (ids.politicas.length) await db.delete(schema.politicasReembolso).where(inArray(schema.politicasReembolso.id, ids.politicas));
      if (ids.veiculos.length) await db.delete(schema.veiculos).where(inArray(schema.veiculos.id, ids.veiculos));
      if (ids.pessoas.length) await db.delete(schema.colaboradores).where(inArray(schema.colaboradores.id, ids.pessoas));
      if (ids.empresas.length) await db.delete(schema.empresas).where(inArray(schema.empresas.id, ids.empresas));
      if (ids.usuarios.length) await db.delete(schema.usuarios).where(inArray(schema.usuarios.id, ids.usuarios));
    } finally { injected.db = undefined; await pool?.end(); }
  }, 30_000);

  it("canal inclui convidado ativo somente da empresa autorizada", async () => {
    const phoneA=`55${String(empresaA).padStart(9,"0")}91`,phoneB=`55${String(empresaB).padStart(9,"0")}92`;
    await db.update(schema.colaboradores).set({telefone:phoneA}).where(eq(schema.colaboradores.id,pessoaA2));
    await db.update(schema.colaboradores).set({telefone:phoneB}).where(eq(schema.colaboradores.id,pessoaB));
    for (const [empresaId,colaboradorId,telefone] of [[empresaA,pessoaA2,phoneA],[empresaB,pessoaB,phoneB]] as const) {
      await db.insert(schema.whatsappOutbox).values({provider:"dialog360",chaveIdempotencia:createHash("sha256").update(randomUUID()).digest("hex"),empresaId,colaboradorId,telefone,tipoMensagem:"convite",payload:{},status:"enviado",providerMensagemId:`wamid.${randomUUID()}`});
    }
    try {
      vi.stubEnv("WHATSAPP_POC_ALLOWED_COMPANIES",String(empresaA));
      const permitidos=await incluirConvidadosPermitidos(new Set());
      expect(permitidos.has(phoneA)).toBe(true);expect(permitidos.has(phoneB)).toBe(false);
    } finally {vi.unstubAllEnvs();}
  });
  it("FKs compostas rejeitam pessoa/despesa de outro tenant", async () => {
    await expect(db.insert(poc.pocCampo).values({ empresaId: empresaA, colaboradorId: pessoaB, estado: novoEstadoCampo() })).rejects.toThrow();
    const documentoId = randomUUID(); ids.documentos.push(documentoId);
    await expect(db.insert(poc.pocDocumentos).values({ id: documentoId, empresaId: empresaA, colaboradorId: pessoaB, hash: createHash("sha256").update(documentoId).digest("hex") })).rejects.toThrow();
    await expect(db.insert(poc.pocPagamentos).values({ empresaId: empresaB, despesaId: despesaAprovada, usuarioId: usuarioB, referencia: run, pagoEm: new Date() })).rejects.toThrow();
  });

  it("duas capturas simultâneas preservam ambos eventos; replay não duplica", async () => {
    const jornadaId = randomUUID();
    const ocorridoEm = new Date(Date.now() - 60_000).toISOString();
    const input = { jornadaId, veiculo: placa, ponto: { id: `${run}-inicio`, tipo: "check_in" as const, latitude: -22, longitude: -43, ocorridoEm } };
    await registrarEventoCampo(identity(), input, usuarioA);
    const a = { ...input, ponto: { ...input.ponto, id: `${run}-a`, tipo: "checkpoint" as const } };
    const b = { ...input, ponto: { ...input.ponto, id: `${run}-b`, tipo: "checkpoint" as const } };
    await Promise.all([registrarEventoCampo(identity(), a, usuarioA), registrarEventoCampo(identity(), b, usuarioA)]);
    await registrarEventoCampo(identity(), a, usuarioA);
    const [row] = await db.select().from(poc.pocCampo).where(eq(poc.pocCampo.colaboradorId, pessoaA));
    expect(row.estado.jornadas[0].pontos.map(p => p.id).sort()).toEqual([input.ponto.id, a.ponto.id, b.ponto.id].sort());
    await expect(registrarEventoCampo({ empresaId: empresaB, colaboradorId: pessoaA }, a, usuarioB)).rejects.toThrow(/Vínculo/);
  });

  it("falha no callback reverte alterações do agregado e auditoria", async () => {
    const [antes] = await db.select().from(poc.pocCampo).where(eq(poc.pocCampo.colaboradorId, pessoaA));
    await expect(alterarCampo(identity(), usuarioA, "fixture.rollback", estado => { estado.jornadas = []; throw new Error("rollback fixture"); })).rejects.toThrow("rollback fixture");
    const [depois] = await db.select().from(poc.pocCampo).where(eq(poc.pocCampo.colaboradorId, pessoaA));
    expect(depois.estado).toEqual(antes.estado);
  });

  it("confirmação sai da fila antes do OCR, com texto único, replay idempotente e limite de 24h", async () => {
    const telefone = `551198${(BigInt(`0x${run.slice(0, 8)}`) % 10000000n).toString().padStart(7, "0")}`;
    const [pessoa] = await db.insert(schema.colaboradores).values({ empresaId: empresaA, nome: "Remetente sintético", telefone, statusVinculo: "ativo" });
    ids.pessoas.push(pessoa.insertId);
    const mensagemId = `fixture-confirmacao-${run}`;
    const [entrada] = await db.insert(schema.whatsappInbox).values({ provider: "dialog360", chaveIdempotencia: createHash("sha256").update(mensagemId).digest("hex"), mensagemId, telefone: telefone.slice(0, 4) + telefone.slice(5), tipoEvento: "mensagem", recebidoEm: new Date(), payload: { messages: [{ id: mensagemId, type: "image", image: { id: "fixture-media" } }] }, status: "pendente" });
    ids.inbox.push(entrada.insertId);
    vi.stubEnv("WHATSAPP_POC_ENABLED", "true");
    vi.stubEnv("WHATSAPP_POC_ALLOWED_PHONES", telefone);
    vi.stubEnv("DIALOG_360_API_KEY", "fixture-sem-rede");
    vi.stubEnv("DIALOG_360_WEBHOOK_SECRET", "fixture-sem-rede");
    const sendText = vi.fn().mockResolvedValue("wamid.fixture-confirmacao");
    const transport = vi.spyOn(dialogTransport, "createDialog360Transport").mockReturnValue({ nome: "fixture", sendText, downloadMedia: vi.fn() });
    try {
      await enfileirarConfirmacoesComprovante(entrada.insertId - 1);
      await enfileirarConfirmacoesComprovante(entrada.insertId - 1);
      const [inbox] = await db.select().from(schema.whatsappInbox).where(eq(schema.whatsappInbox.id, entrada.insertId));
      expect(inbox).toMatchObject({ status: "pendente", despesaId: null, tentativas: 0 });
      const outbox = await db.select().from(schema.whatsappOutbox).where(eq(schema.whatsappOutbox.colaboradorId, pessoa.insertId));
      expect(outbox).toHaveLength(1);
      expect(outbox[0].payload).toMatchObject({ texto: "Comprovante Recebido!", referencia: mensagemId });
      await enviarProximaRespostaWhatsapp();
      await enviarProximaRespostaWhatsapp();
      expect(sendText).toHaveBeenCalledExactlyOnceWith(telefone, "Comprovante Recebido!");
      // Uma confirmação que expirou na fila é cancelada, sem um segundo POST.
      const [expirada] = await db.insert(schema.whatsappOutbox).values({ empresaId: empresaA, colaboradorId: pessoa.insertId, telefone, provider: "dialog360", tipoMensagem: "text", chaveIdempotencia: createHash("sha256").update(`${mensagemId}-expirada`).digest("hex"), payload: { texto: "Comprovante Recebido!", recebidoEm: new Date(Date.now() - 24 * 3600_000).toISOString() } });
      await enviarProximaRespostaWhatsapp();
      expect(sendText).toHaveBeenCalledTimes(1);
      const [cancelada] = await db.select().from(schema.whatsappOutbox).where(eq(schema.whatsappOutbox.id, expirada.insertId));
      expect(cancelada.status).toBe("cancelado");
    } finally { transport.mockRestore(); vi.unstubAllEnvs(); }
  });

  it("checkout e consulta Maps persistem IDs; concorrência e replay não repetem a API", async () => {
    const [antes] = await db.select().from(poc.pocCampo).where(eq(poc.pocCampo.colaboradorId, pessoaA));
    const jornadaId = antes.estado.jornadas[0].id;
    const checkoutId = `${run}-retorno`;
    await registrarEventoCampo(identity(), { jornadaId, veiculo: placa, ponto: { id: checkoutId, tipo: "check_out", latitude: -22.1, longitude: -43.1, ocorridoEm: new Date().toISOString() } }, usuarioA);
    const [config] = await db.select().from(poc.pocConfiguracao).where(eq(poc.pocConfiguracao.empresaId, empresaA));
    await db.update(poc.pocConfiguracao).set({ configuracao: { ...config.configuracao, calculoMapsAutomatico: true, intervaloConsultaMapsMinutos: 15 } }).where(eq(poc.pocConfiguracao.empresaId, empresaA));
    const estimar = vi.fn(async () => {
      // Conexão independente enxerga a reserva ANTES da chamada simulada.
      const [reservado] = await db.select().from(poc.pocCampo).where(eq(poc.pocCampo.colaboradorId, pessoaA));
      const jornada = reservado.estado.jornadas.find(j => j.id === jornadaId)!;
      expect(jornada.calculo.consultaId).toMatch(/^[0-9a-f-]{36}$/);
      expect(jornada.calculo.tentativas).toBe(1);
      expect(Date.parse(jornada.calculo.proximaTentativaEm!) - Date.parse(jornada.calculo.ultimaTentativaEm!)).toBe(15 * 60_000);
      expect(jornada.pontos.at(-1)?.id).toBe(checkoutId);
      return { estado: "estimado" as const, metros: 12000, calculadoEm: new Date().toISOString() };
    });
    const deps = { habilitado: true, apiKey: "fixture-sem-rede", estimar };
    await Promise.all([calcularJornadaPersistida(identity(), jornadaId, null, true, deps), calcularJornadaPersistida(identity(), jornadaId, null, true, deps)]);
    await calcularJornadaPersistida(identity(), jornadaId, usuarioA, false, deps);
    expect(estimar).toHaveBeenCalledTimes(1);
    const [depois] = await db.select().from(poc.pocCampo).where(eq(poc.pocCampo.colaboradorId, pessoaA));
    expect(depois.estado.jornadas.find(j => j.id === jornadaId)?.calculo).toMatchObject({ estado: "estimado", metros: 12000, tentativas: 1 });
  });

  it("índice único deduplica hash simultâneo entre colaboradores da mesma empresa", async () => {
    const hash = createHash("sha256").update(`concorrente-${run}`).digest("hex");
    const registros = [pessoaA, pessoaA2].map(colaboradorId => { const id = randomUUID(); ids.documentos.push(id); return { id, empresaId: empresaA, colaboradorId, hash }; });
    const resultados = await Promise.allSettled(registros.map(r => db.insert(poc.pocDocumentos).values(r)));
    expect(resultados.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const rows = await db.select().from(poc.pocDocumentos).where(and(eq(poc.pocDocumentos.empresaId, empresaA), eq(poc.pocDocumentos.hash, hash)));
    expect(rows).toHaveLength(1);
  });

  it("importações concorrentes do mesmo binário produzem um único documento", async () => {
    const binario = Buffer.from(`comprovante sintetico ${run}`);
    const hash = createHash("sha256").update(binario).digest("hex");
    const criarOrigem = async (colaboradorId: number) => {
      const [n] = await db.insert(schema.notasFiscais).values({ empresaId: empresaA, arquivoNome: "fixture.png", arquivoMime: "image/png", arquivoBase64: binario.toString("base64"), arquivoChecksum: hash }); ids.notas.push(n.insertId);
      const [d] = await db.insert(schema.despesas).values({ empresaId: empresaA, notaFiscalId: n.insertId, status: "em_revisao" }); ids.despesas.push(d.insertId);
      const [i] = await db.insert(schema.whatsappInbox).values({ empresaId: empresaA, colaboradorId, despesaId: d.insertId, provider: "dialog360", chaveIdempotencia: createHash("sha256").update(randomUUID()).digest("hex"), tipoEvento: "comprovante", payload: {}, status: "processado" }); ids.inbox.push(i.insertId);
      return n.insertId;
    };
    const notaA = await criarOrigem(pessoaA), notaA2 = await criarOrigem(pessoaA2);
    const extracao: ExtracaoCombustivel = { cnpjEmitente: null, cfop: null, ncm: null, cst: null, valor: null, dataFatoGerador: null, litros: null, categoriaSugerida: null, confiancaExtracao: "baixa", camposPendentes: ["fixture"], provedor: "fixture-local", avisos: [] };
    const ocr = { nome: "fixture-local", extrair: async () => extracao };
    const results = await Promise.allSettled([
      importarDocumentoCampo(identity(), { notaFiscalId: notaA, veiculo: placa }, ocr, usuarioA),
      importarDocumentoCampo({ empresaId: empresaA, colaboradorId: pessoaA2 }, { notaFiscalId: notaA2, veiculo: placa }, ocr, usuarioA),
    ]);
    expect(results.some(r => r.status === "fulfilled")).toBe(true);
    const rows = await db.select().from(poc.pocDocumentos).where(and(eq(poc.pocDocumentos.empresaId, empresaA), eq(poc.pocDocumentos.hash, hash)));
    expect(rows).toHaveLength(1);
    expect((await importarDocumentoCampo(identity(), { notaFiscalId: notaA, veiculo: placa }, ocr, usuarioA)).duplicado).toBe(true);
    await expect(importarDocumentoCampo({ empresaId: empresaB, colaboradorId: pessoaB }, { notaFiscalId: notaA, veiculo: placa }, ocr, usuarioB)).rejects.toThrow(/Comprovante/);
  });

  it("chave fiscal deduplica binários diferentes apenas dentro do tenant", async () => {
    const chave = `${Date.now()}${Math.floor(Math.random() * 1e10)}`.padEnd(44, "1").slice(0, 44);
    const criar = (empresaId: number, colaboradorId: number) => {
      const id = randomUUID(); ids.documentos.push(id);
      return { id, empresaId, colaboradorId, chave, hash: createHash("sha256").update(id).digest("hex") };
    };
    await db.insert(poc.pocDocumentos).values(criar(empresaA, pessoaA));
    await expect(db.insert(poc.pocDocumentos).values(criar(empresaA, pessoaA2))).rejects.toThrow();
    await db.insert(poc.pocDocumentos).values(criar(empresaB, pessoaB));
    const rows = await db.select().from(poc.pocDocumentos).where(eq(poc.pocDocumentos.chave, chave));
    expect(rows).toHaveLength(2);
  });

  it("veículo unificado preserva campos e barra vínculo cruzado na API e no banco", async () => {
    const contexto = (id: number) => ({ req: new Request("http://localhost/test"), resHeaders: new Headers(), usuario: { id, nome: "Fixture", email: "fixture@example.invalid", perfil: "cliente" as const } });
    const api = veiculosRouter.createCaller(contexto(usuarioA));
    const input = { empresaId: empresaA, colaboradorId: pessoaA, placa: "ABC1D23", renavam: "12345678901", motorizacao: "combustao" as const, ufLicenciamento: "SP" as const, kmPorLitroDeclarado: 12 };
    await expect(api.salvar({ ...input, colaboradorId: pessoaB })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(db.insert(schema.veiculos).values({ ...input, colaboradorId: pessoaB }).then(([r]) => { ids.veiculos.push(r.insertId); return r; })).rejects.toThrow();
    const result = await api.salvar(input); ids.veiculos.push(result.id);
    await expect(api.salvar(input)).rejects.toMatchObject({ code: "CONFLICT" });
    const rows = await api.listar({ empresaId: empresaA });
    expect(rows.find(row => row.id === result.id)).toMatchObject(input);
    await expect(veiculosRouter.createCaller(contexto(usuarioB)).listar({ empresaId: empresaA })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("pagamento exige aprovação e tenant; replay idêntico é único", async () => {
    const pagoEm = new Date(Math.floor((Date.now() - 60_000) / 1000) * 1000).toISOString();
    await expect(caller(usuarioA).registrarPagamento({ despesaId: despesaPendente, referencia: run, pagoEm })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    await expect(caller(usuarioB).registrarPagamento({ despesaId: despesaAprovada, referencia: run, pagoEm })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const input = { despesaId: despesaAprovada, referencia: run, pagoEm };
    await Promise.all([caller(usuarioA).registrarPagamento(input), caller(usuarioA).registrarPagamento(input)]);
    const rows = await db.select().from(poc.pocPagamentos).where(eq(poc.pocPagamentos.despesaId, despesaAprovada));
    expect(rows).toHaveLength(1); expect(rows[0].usuarioId).toBe(usuarioA);
    await expect(caller(usuarioA).registrarPagamento({ ...input, referencia: "outra-referencia" })).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("presença persiste sem veículo ou política, com replay, isolamento e vinculação posterior", async () => {
    const id = { empresaId: empresaB, colaboradorId: pessoaB };
    expect(await db.select().from(schema.veiculos).where(eq(schema.veiculos.empresaId, empresaB))).toHaveLength(0);
    expect(await db.select().from(poc.pocConfiguracao).where(eq(poc.pocConfiguracao.empresaId, empresaB))).toHaveLength(0);
    expect(await db.select().from(schema.politicasReembolso).where(eq(schema.politicasReembolso.empresaId, empresaB))).toHaveLength(0);
    const timestamp = Math.floor(Date.now() / 1000);
    const local = { id: `entrada-${run}`, type: "location", timestamp, location: { latitude: -22, longitude: -43 } };
    await interpretarMensagemCampo(id, { id: `cmd1-${run}`, type: "text", text: "check-in", timestamp });
    await Promise.all([interpretarMensagemCampo(id, local), interpretarMensagemCampo(id, local)]);
    await interpretarMensagemCampo(id, { id: `cmd2-${run}`, type: "text", text: "check-out", timestamp });
    await interpretarMensagemCampo(id, { ...local, id: `saida-${run}` });
    const estado = await caller(usuarioB).consultar({ colaboradorId: pessoaB });
    expect(estado.presencas).toHaveLength(1);
    expect(estado.presencas![0].pontos).toHaveLength(2);
    expect(estado.presencas![0].pontos[0].comandoId).toBe(`cmd1-${run}`);
    expect(estado.jornadas).toHaveLength(0);
    await expect(caller(usuarioA).consultar({ colaboradorId: pessoaB })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller(usuarioB).vincularPresenca({ colaboradorId: pessoaB, presencaId: estado.presencas![0].id, veiculo: "SEM1A23" })).rejects.toThrow(/política/);
    expect((await caller(usuarioB).consultar({ colaboradorId: pessoaB })).presencas).toEqual(estado.presencas);
    // Vinculação posterior usa o mesmo registro, em empresa com requisitos financeiros.
    await alterarCampo(identity(), usuarioA, "fixture-presenca", e => { e.presencas = structuredClone(estado.presencas); });
    const input = { colaboradorId: pessoaA, presencaId: estado.presencas![0].id, veiculo: placa };
    // Ensaios anteriores podem manter jornada aberta: usa o outro colaborador da mesma empresa.
    input.colaboradorId = pessoaA2;
    await alterarCampo({ empresaId: empresaA, colaboradorId: pessoaA2 }, usuarioA, "fixture-presenca", e => { e.presencas = structuredClone(estado.presencas); });
    const vinculada = await caller(usuarioA).vincularPresenca(input);
    expect(vinculada.pontos).toHaveLength(2);
    expect(await caller(usuarioA).vincularPresenca(input)).toEqual(vinculada);
    expect((await caller(usuarioA).consultar({ colaboradorId: pessoaA2 })).jornadas).toHaveLength(1);
  });
  it("decisão humana grava quem e motivo uma vez; falha na auditoria reverte estado", async () => {
    const [n] = await db.insert(schema.notasFiscais).values({ empresaId: empresaA, arquivoNome: "fixture-auditoria.txt" }); ids.notas.push(n.insertId);
    const [d] = await db.insert(schema.despesas).values({ empresaId: empresaA, notaFiscalId: n.insertId, status: "em_revisao", confianca: "alta" }); ids.despesas.push(d.insertId);
    await expect(db.transaction(async tx => {
      await tx.update(schema.despesas).set({ status: "aprovada" }).where(eq(schema.despesas.id, d.insertId));
      await registrarDecisaoDespesa(tx, { empresaId: empresaA, despesaId: d.insertId, origemDecisao: "humana", usuarioId: usuarioA, usuarioNome: "Revisor", motivo: "", statusAplicado: "aprovada", politicaId: null, politicaVersao: null });
    })).rejects.toThrow();
    expect((await db.select().from(schema.despesas).where(eq(schema.despesas.id, d.insertId)))[0].status).toBe("em_revisao");
    const api = revisaoRouter.createCaller({ req: new Request("http://localhost/test"), resHeaders: new Headers(), usuario: { id: usuarioA, nome: "Revisor SQL", email: "revisor@example.invalid", perfil: "cliente" } });
    const input = { empresaId: empresaA, despesaId: d.insertId, decisao: "aprovar" as const, justificativa: "Evidência e política conferidas pelo revisor.", motivoDelegacao: "Responsável pelo teste isolado" };
    const result = await Promise.allSettled([api.decidir(input), api.decidir(input)]);
    expect(result.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const logs = await historicoDecisoesDespesa(empresaA, d.insertId);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ origemDecisao: "humana", usuarioId: usuarioA, usuarioNome: "Revisor SQL", motivo: input.justificativa, aprovacaoEfetiva: true });
    expect(await historicoDecisoesDespesa(empresaB, d.insertId)).toHaveLength(0);
  });
  it("WhatsApp decide pela política nos três modos e bloqueia reenvio antes de nova despesa", async () => {
    const regras = regrasPoliticaSchema.parse({ regrasExtraidas: [{
      id: "refeicao-fixture", tema: "alimentacao", categoria: "alimentacao", escopo: "categoria",
      descricao: "Refeição aprovada até R$ 50.", valorLimite: 50, moeda: "BRL",
      decisaoAutomatica: "aprovar", reembolsavel: "sim",
    }] });
    await db.update(schema.politicasReembolso).set({ regras }).where(eq(schema.politicasReembolso.id, ids.politicas[0]));
    const [original] = await db.select().from(poc.pocConfiguracao).where(eq(poc.pocConfiguracao.empresaId, empresaA));
    for (const modo of ["sombra", "assistido", "autonomo"] as const) {
      await db.update(poc.pocConfiguracao).set({ configuracao: { ...original.configuracao, modo } }).where(eq(poc.pocConfiguracao.empresaId, empresaA));
      const pedido = { ...identity(), mensagemId: `${run}-${modo}`, recebidoEm: "2026-09-14T12:15:00.000Z",
        comprovante: { arquivoNome: "fixture.pdf", arquivoMime: "application/pdf" as const, conteudo: Buffer.from(`%PDF-${run}-${modo}`) },
        extracao: { categoriaSugerida: "alimentacao" as const, valor: 40, dataFatoGerador: "2026-09-13", cnpjEmitente: "12345678000199", confiancaExtracao: "alta" as const, camposPendentes: [], cfop: null, ncm: null, cst: null, litros: null, provedor: "fixture-local", avisos: [] },
      };
      const result = await receberComprovanteWhatsapp(pedido);
      ids.despesas.push(result.despesaId!);
      const [despesa] = await db.select().from(schema.despesas).where(eq(schema.despesas.id, result.despesaId!));
      ids.notas.push(despesa.notaFiscalId!);
      const [inbox] = await db.select().from(schema.whatsappInbox).where(eq(schema.whatsappInbox.despesaId, result.despesaId!));
      ids.inbox.push(inbox.id);
      expect(inbox.recebidoEm.toISOString()).toBe(pedido.recebidoEm);
      const envio = (await metadadosDespesasWhatsapp(empresaA, [despesa.id])).get(despesa.id);
      expect(envio).toMatchObject({colaboradorId:pessoaA,nome:"Pessoa sintética",enviadoEm:new Date(pedido.recebidoEm)});
      expect((await metadadosDespesasWhatsapp(empresaB, [despesa.id])).size).toBe(0);
      expect(despesa.categoria).toBe("alimentacao");
      expect(despesa.politicaDecisao).toBe("aprovado");
      expect(despesa.politicaVersaoAplicada).toBe(1);
      expect(despesa.status).toBe(modo === "autonomo" ? "aprovada" : "em_revisao");
      const logs = await db.select().from(schema.logAuditoria).where(and(eq(schema.logAuditoria.entidadeId, despesa.id), eq(schema.logAuditoria.empresaId, empresaA), eq(schema.logAuditoria.acao, "reembolso_decisao")));
      expect(logs).toHaveLength(1);
      expect(JSON.parse(logs[0].detalhes!).modo).toBe(modo);
      const decisoes = await historicoDecisoesDespesa(empresaA, despesa.id);
      expect(decisoes).toHaveLength(1);
      expect(decisoes[0]).toMatchObject({ origemDecisao: "automatica", usuarioId: null, usuarioNome: null, aprovacaoEfetiva: modo === "autonomo", statusAplicado: despesa.status });
      const replay = await receberComprovanteWhatsapp(pedido);
      expect(replay.despesaId).toBe(result.despesaId);
      expect(await historicoDecisoesDespesa(empresaA, despesa.id)).toHaveLength(1);
      await expect(receberComprovanteWhatsapp({ ...pedido, colaboradorId: pessoaA2, mensagemId: `${run}-${modo}-reenvio` })).rejects.toMatchObject({ codigo: "DUPLICADO" });
      const notas = await db.select().from(schema.notasFiscais).where(and(eq(schema.notasFiscais.empresaId, empresaA), eq(schema.notasFiscais.arquivoChecksum, createHash("sha256").update(pedido.comprovante.conteudo).digest("hex"))));
      expect(notas).toHaveLength(1);
    }
    await db.update(poc.pocConfiguracao).set({ configuracao: original.configuracao }).where(eq(poc.pocConfiguracao.empresaId, empresaA));
  });


  it("S5 token limita identidade no SQL e impede empresa/pessoa cruzada na API", async () => {
    const telefone = `55${String(empresaA).padStart(11, "0")}`;
    await db.update(schema.colaboradores).set({ telefone }).where(inArray(schema.colaboradores.id, [pessoaA, pessoaB]));
    const token = `fixture-${randomUUID()}`;
    const app = new Hono<ServicoEnv>();
    app.use("/*", exigirServicoAutenticado(JSON.stringify([{ token, empresaId: empresaA }])));
    app.route("/", criarRouterIdentificacaoWhatsapp(resolverColaboradoresPorTelefone));
    app.route("/", criarRouterComprovanteWhatsapp(receberComprovanteWhatsapp));
    const headers = { Authorization: `Bearer ${token}` };
    const encontrados = await resolverColaboradoresPorTelefone(telefone, empresaA);
    expect(encontrados.map(p => p.colaboradorId)).toEqual([pessoaA]);
    const resposta = await app.request(`http://local/colaboradores?telefone=%2B${telefone}&empresa_id=${empresaB}`, { headers });
    expect(resposta.status).toBe(200);
    const corpo = await resposta.json() as { colaboradores: { empresaId: number }[] };
    expect(corpo.colaboradores.map(p => p.empresaId)).toEqual([empresaA]);
    for (const empresa of [empresaB, empresaA]) {
      const form = new FormData();
      form.set("empresa_id", String(empresa)); form.set("colaborador_id", String(pessoaB));
      form.set("mensagem_id", `fixture-${randomUUID()}`);
      form.set("arquivo", new File(["%PDF-fixture"], "fixture.pdf", { type: "application/pdf" }));
      expect((await app.request("http://local/despesas", { method: "POST", headers, body: form })).status).toBe(403);
    }
  });

  it("S9 revisor sem vínculo é barrado e desligamento revoga acesso/listagem/designação", async () => {
    const ctx = { req: new Request("http://localhost/test"), resHeaders: new Headers(), usuario: { id: usuarioB, nome: "Fixture", email: "fixture@example.invalid", perfil: "revisor" as const } };
    await expect(assertEmpresaAcesso(ctx, empresaA)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(assertEmpresaAcesso({ ...ctx, usuario: null }, empresaA)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await db.update(schema.colaboradores).set({ usuarioId: usuarioB, statusVinculo: "ativo" }).where(eq(schema.colaboradores.id, pessoaA2));
    await db.insert(schema.empresasConfig).values({ empresaId: empresaA, aprovadorId: pessoaA2 });
    expect((await papelRevisaoNaEmpresa(ctx, empresaA)).papel.ehAprovadorDesignado).toBe(true);
    expect(await ehDesignadoDeAlgumaEmpresa(usuarioB)).toEqual({ aprovador: true, analista: false });
    expect((await empresasRouter.createCaller(ctx).list()).map(e => e.id)).toContain(empresaA);
    await db.update(schema.colaboradores).set({ statusVinculo: "desligado" }).where(eq(schema.colaboradores.id, pessoaA2));
    await expect(assertEmpresaAcesso(ctx, empresaA)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(papelRevisaoNaEmpresa(ctx, empresaA)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await ehDesignadoDeAlgumaEmpresa(usuarioB)).toEqual({ aprovador: false, analista: false });
    expect((await empresasRouter.createCaller(ctx).list()).map(e => e.id)).not.toContain(empresaA);
    const owner = { ...ctx, usuario: { ...ctx.usuario, id: usuarioA, perfil: "cliente" as const } };
    expect((await papelRevisaoNaEmpresa(owner, empresaA)).papel.temAprovadorDesignado).toBe(false);
    await expect(db.update(schema.empresasConfig).set({ aprovadorId: pessoaB }).where(eq(schema.empresasConfig.empresaId, empresaA))).rejects.toThrow();
  });

});

describe("gate do banco de integração", () => {
  it.each(["mysql://user:pass@external.example/reembolsa_poc_test_a", "mysql://user:pass@localhost/producao", "mysql://user:pass@localhost/reembolsa_poc_test_a?socketPath=/tmp/mysql.sock", "postgres://localhost/reembolsa_poc_test_a"])("rejeita destino não autorizado sem conectar", value => expect(() => validarBancoTeste(value)).toThrow());

});

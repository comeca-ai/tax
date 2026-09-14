import { describe, expect, it, vi } from "vitest";
import { AsyncLocalStorage } from "node:async_hooks";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import type { SQL } from "drizzle-orm";
import {
  colaboradores,
  convites,
  empresas,
  usuarios,
  whatsappOutbox,
  whatsappWebhookEvents,
} from "../../../../db/schema";
import {
  enviarConviteColaboradorIdempotente,
  reciboConfirmaEntrega,
} from "./servico";
import type { getDb } from "../../../queries/connection";

const now = new Date("2026-09-13T18:00:00Z");
const input = { empresaId: 10, colaboradorId: 20, usuarioId: 30 };
type Row = Record<string, unknown>;

function bancoSimulado() {
  const data = new Map<unknown, Row[]>([
    [
      colaboradores,
      [
        {
          id: 20,
          empresaId: 10,
          nome: "Fixture",
          email: "fixture@example.invalid",
          telefone: "5521999999999",
          usuarioId: null,
          statusVinculo: "ativo",
        },
      ],
    ],
    [usuarios, [{ id: 30, email: "admin@example.invalid" }]],
    [empresas, [{ id: 10, usuarioId: 30, razaoSocial: "Empresa sintética" }]],
    [
      convites,
      [
        {
          id: 90,
          email: "fixture@example.invalid",
          token: "convite-preexistente-outra-empresa",
          status: "pendente",
          expiresAt: new Date(now.getTime() + 86400_000),
        },
      ],
    ],
    [whatsappOutbox, []],
    [whatsappWebhookEvents, []],
  ]);
  let sequence = 100;
  let txAberta = false;
  let queue = Promise.resolve();
  let updatesExternos = 0;
  let falharUpdateExterno = 0;
  const escopo = new AsyncLocalStorage<boolean>();
  const ops: { table: unknown; tipo: string }[] = [];
  const params = (condition?: SQL) =>
    condition ? new MySqlDialect().sqlToQuery(condition).params : [];
  const filtered = (table: unknown, condition?: SQL) => {
    const p = params(condition);
    const rows = data.get(table) ?? [];
    if (table === colaboradores)
      return rows.filter(r => r.id === p[0] && r.empresaId === p[1]);
    if (table === empresas || table === convites || table === usuarios)
      return rows.filter(r => r.id === p[0]);
    if (table === whatsappOutbox)
      return p[0] === "dialog360"
        ? rows.filter(r => r.provider === p[0] && r.chaveIdempotencia === p[1])
        : rows.filter(
            r => r.id === p[0] && (p.length < 2 || r.empresaId === p[1])
          );
    if (table === whatsappWebhookEvents)
      return rows.filter(
        r =>
          r.tipoEvento === p[0] &&
          r.mensagemId === p[1] &&
          r.telefone === p[2] &&
          r.canalTelefone === p[3] &&
          p.slice(4).includes(r.statusEntrega)
      );
    return [];
  };
  const db = {
    select: () => ({
      from: (table: unknown) => ({
        where: (condition: SQL) => {
          const rows = () => structuredClone(filtered(table, condition));
          return {
            for: async () => rows(),
            limit: async (n: number) => rows().slice(0, n),
          };
        },
      }),
    }),
    insert: (table: unknown) => ({
      values: async (value: Row) => {
        ops.push({ table, tipo: "insert" });
        const id = sequence++;
        data
          .get(table)!
          .push(
            structuredClone({
              id,
              status: "pendente",
              providerMensagemId: null,
              createdAt: now,
              updatedAt: now,
              ...value,
            })
          );
        return [{ insertId: id }];
      },
    }),
    update: (table: unknown) => ({
      set: (value: Row) => ({
        where: async (condition: SQL) => {
          if (!txAberta && ++updatesExternos === falharUpdateExterno)
            throw new Error("falha DB simulada");
          ops.push({ table, tipo: "update" });
          for (const row of filtered(table, condition))
            Object.assign(row, structuredClone(value));
          return [{ affectedRows: 1 }];
        },
      }),
    }),
    transaction: async <T>(
      callback: (tx: unknown) => Promise<T>
    ): Promise<T> => {
      const anterior = queue;
      let liberar!: () => void;
      queue = new Promise<void>(resolve => {
        liberar = resolve;
      });
      await anterior;
      const snapshot = new Map(
        [...data].map(([table, rows]) => [table, structuredClone(rows)])
      );
      txAberta = true;
      try {
        return await escopo.run(true, () => callback(db));
      } catch (e) {
        data.clear();
        snapshot.forEach((v, k) => data.set(k, v));
        throw e;
      } finally {
        txAberta = false;
        liberar();
      }
    },
  };
  const email = vi.fn(async () => {
    expect(escopo.getStore()).not.toBe(true);
    expect(data.get(whatsappOutbox)).toHaveLength(1);
    return { enviado: true };
  });
  const whatsapp = vi.fn(async () => {
    expect(escopo.getStore()).not.toBe(true);
    return {
      enviado: true,
      messageId: "wamid.fixture",
      status: "aceito" as const,
    };
  });
  return {
    data,
    ops,
    email,
    whatsapp,
    falharUpdate: (n: number) => {
      falharUpdateExterno = n;
    },
    deps: {
      db: db as unknown as ReturnType<typeof getDb>,
      email,
      whatsapp,
      agora: () => now,
    },
  };
}

describe("convite durável idempotente", () => {
  it("duplo clique retorna mesmo convite sem repetir rede nem revogar outro convite", async () => {
    const f = bancoSimulado();
    const [a, b] = await Promise.all([
      enviarConviteColaboradorIdempotente(input, f.deps),
      enviarConviteColaboradorIdempotente(input, f.deps),
    ]);
    expect(a.conviteId).toBe(b.conviteId);
    expect(a.linkAceite).toBe(b.linkAceite);
    expect(f.email).toHaveBeenCalledTimes(1);
    expect(f.whatsapp).toHaveBeenCalledTimes(1);
    expect(f.data.get(convites)?.[0].status).toBe("pendente");
    expect(f.ops.some(o => o.table === convites && o.tipo === "update")).toBe(
      false
    );
    const replay = await enviarConviteColaboradorIdempotente(input, f.deps);
    expect(replay.statusWhatsapp).toBe("aceito");
    const payload = f.data.get(whatsappOutbox)![0].payload as Row;
    expect(Object.keys(payload).sort()).toEqual(
      ["conviteId", "enviadoPorEmail", "statusWhatsapp"].sort()
    );
    expect(JSON.stringify(payload)).not.toContain(a.linkAceite);
  });
  it("timeout/sem confirmação não volta a fazer POST", async () => {
    const f = bancoSimulado();
    const whatsapp = vi.fn(async () => ({
      enviado: false,
      messageId: null,
      status: "incerto" as const,
    }));
    const deps = { ...f.deps, whatsapp };
    expect(
      (await enviarConviteColaboradorIdempotente(input, deps)).statusWhatsapp
    ).toBe("incerto");
    expect(
      (await enviarConviteColaboradorIdempotente(input, deps)).statusWhatsapp
    ).toBe("incerto");
    expect(whatsapp).toHaveBeenCalledTimes(1);
  });
  it("falha DB depois de POST mantém reserva e não dispara nova chamada", async () => {
    const f = bancoSimulado();
    f.falharUpdate(2);
    expect(
      (await enviarConviteColaboradorIdempotente(input, f.deps)).statusWhatsapp
    ).toBe("incerto");
    const deps = { ...f.deps, agora: () => new Date(now.getTime() + 121_000) };
    expect(
      (await enviarConviteColaboradorIdempotente(input, deps)).statusWhatsapp
    ).toBe("incerto");
    expect(f.whatsapp).toHaveBeenCalledTimes(1);
    expect(f.email).toHaveBeenCalledTimes(1);
  });
  it.each(["revogado", "expirado"])(
    "convite %s exige resolução explícita",
    async status => {
      const f = bancoSimulado();
      const r = await enviarConviteColaboradorIdempotente(input, f.deps);
      const convite = f.data.get(convites)!.find(v => v.id === r.conviteId)!;
      if (status === "revogado") convite.status = "revogado";
      else convite.expiresAt = new Date(now.getTime() - 1);
      await expect(
        enviarConviteColaboradorIdempotente(input, f.deps)
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect(f.whatsapp).toHaveBeenCalledTimes(1);
    }
  );
  it.each([{ statusVinculo: "suspenso" }, { usuarioId: 999 }, { email: null }])(
    "cadastro inválido não cria reserva nem efeitos: %j",
    async alteracoes => {
      const f = bancoSimulado();
      Object.assign(f.data.get(colaboradores)![0], alteracoes);
      await expect(
        enviarConviteColaboradorIdempotente(input, f.deps)
      ).rejects.toThrow();
      expect(f.data.get(whatsappOutbox)).toHaveLength(0);
      expect(f.email).not.toHaveBeenCalled();
      expect(f.whatsapp).not.toHaveBeenCalled();
    }
  );
  it("recibo correto delivered/read promove estado; sent/outro destino não", async () => {
    const f = bancoSimulado();
    await enviarConviteColaboradorIdempotente(input, f.deps);
    const evento = {
      tipoEvento: "status",
      mensagemId: "wamid.fixture",
      telefone: "5521999999999",
      canalTelefone: "552196483003",
      statusEntrega: "sent",
    };
    f.data.get(whatsappWebhookEvents)!.push(evento);
    expect(
      (await enviarConviteColaboradorIdempotente(input, f.deps)).statusWhatsapp
    ).toBe("aceito");
    evento.statusEntrega = "delivered";
    evento.telefone = "5521888888888";
    expect(
      (await enviarConviteColaboradorIdempotente(input, f.deps)).statusWhatsapp
    ).toBe("aceito");
    evento.telefone = "5521999999999";
    expect(
      (await enviarConviteColaboradorIdempotente(input, f.deps)).statusWhatsapp
    ).toBe("entregue");
    expect(f.whatsapp).toHaveBeenCalledTimes(1);
  });
});

describe("correlação estrita de entrega", () => {
  const e = {
    mensagemId: "id",
    telefone: "5521999999999",
    canalTelefone: "552196483003",
    statusEntrega: "delivered",
  };
  it("exige ID, recipient, canal e delivered/read", () => {
    expect(reciboConfirmaEntrega(e, "id", e.telefone)).toBe(true);
    expect(
      reciboConfirmaEntrega({ ...e, canalTelefone: "outro" }, "id", e.telefone)
    ).toBe(false);
    expect(
      reciboConfirmaEntrega({ ...e, statusEntrega: "sent" }, "id", e.telefone)
    ).toBe(false);
    expect(reciboConfirmaEntrega(e, null, e.telefone)).toBe(false);
  });
});

it("retoma convite bloqueado por saldo em clique explícito sem duplicar e-mail ou WhatsApp concorrente", async () => {
  const f = bancoSimulado();
  const bloqueado = vi.fn(async () => ({
    enviado: false,
    messageId: null,
    status: "limite_atingido" as const,
  }));
  const a = await enviarConviteColaboradorIdempotente(input, {
    ...f.deps,
    whatsapp: bloqueado,
    saldo: () => 0,
  });
  expect(a.statusWhatsapp).toBe("limite_atingido");
  await enviarConviteColaboradorIdempotente(input, {
    ...f.deps,
    saldo: () => 0,
  });
  expect(f.whatsapp).not.toHaveBeenCalled();
  const resultados = await Promise.all([
    enviarConviteColaboradorIdempotente(input, {
      ...f.deps,
      saldo: () => 2,
      agora: () => new Date(now.getTime() + 300_000),
    }),
    enviarConviteColaboradorIdempotente(input, {
      ...f.deps,
      saldo: () => 2,
      agora: () => new Date(now.getTime() + 300_000),
    }),
  ]);
  expect(resultados.every(r => r.conviteId === a.conviteId)).toBe(true);
  expect(resultados.some(r => r.statusWhatsapp === "incerto")).toBe(false);
  expect(f.whatsapp).toHaveBeenCalledTimes(1);
  expect(f.email).toHaveBeenCalledTimes(1);
  expect(f.data.get(whatsappOutbox)).toHaveLength(1);
});

it("novo convite fora do domínio do dono da empresa falha antes da reserva e da rede", async () => {
  const f = bancoSimulado();
  f.data.get(usuarios)![0].email = "admin@reembolsa.ia.br";
  await expect(
    enviarConviteColaboradorIdempotente(input, f.deps)
  ).rejects.toMatchObject({
    code: "BAD_REQUEST",
    message: expect.stringContaining("@reembolsa.ia.br"),
  });
  expect(f.data.get(whatsappOutbox)).toHaveLength(0);
  expect(f.email).not.toHaveBeenCalled();
  expect(f.whatsapp).not.toHaveBeenCalled();
});
it("cadastro antigo fora do domínio é preservado, mas não pode disparar novo envio", async () => {
  const f = bancoSimulado();
  await enviarConviteColaboradorIdempotente(input, f.deps);
  f.data.get(usuarios)![0].email = "admin@reembolsa.ia.br";
  await expect(
    enviarConviteColaboradorIdempotente(input, f.deps)
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(f.data.get(colaboradores)).toHaveLength(1);
  expect(f.data.get(whatsappOutbox)).toHaveLength(1);
  expect(f.email).toHaveBeenCalledTimes(1);
  expect(f.whatsapp).toHaveBeenCalledTimes(1);
});

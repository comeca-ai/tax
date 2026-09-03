import { afterEach, describe, expect, it, vi } from "vitest";
import { whatsappWebhookEvents } from "../../../../db/schema";
import {
  extrairEventosDialog360,
  persistirEventosDialog360,
  processarWebhookDialog360,
} from "./dialog360";

/**
 * NOTA para quem ler depois: `persistirEventosDialog360` é o primeiro teste
 * do projeto a mockar `getDb()`. Não há precedente direto no repo (nenhum
 * router tem teste hoje) — o mock abaixo (`vi.mock` de
 * `../../../queries/connection`, o mesmo caminho relativo que `dialog360.ts`
 * usa para importar) é o modelo para o próximo que precisar disto.
 */
const insertValuesMock = vi.fn().mockResolvedValue(undefined);
const insertMock = vi.fn(() => ({ values: insertValuesMock }));
vi.mock("../../../queries/connection", () => ({
  getDb: () => ({ insert: insertMock }),
}));

/** Monta `value` + o payload que o envolve, devolvendo os dois — para o teste
 * poder comparar o `payload` extraído contra o MESMO objeto `value`. */
function payloadMensagem(overridesValue: Record<string, unknown> = {}): {
  payload: Record<string, unknown>;
  value: Record<string, unknown>;
} {
  const value: Record<string, unknown> = {
    messaging_product: "whatsapp",
    metadata: {
      display_phone_number: "552196483003",
      phone_number_id: "123456",
    },
    contacts: [{ profile: { name: "João" }, wa_id: "5511998887777" }],
    messages: [
      {
        from: "5511998887777",
        id: "wamid.ABC123",
        timestamp: "1717000000",
        type: "text",
        text: { body: "oi" },
      },
    ],
    ...overridesValue,
  };
  const payload = {
    entry: [{ id: "WABA_ID", changes: [{ field: "messages", value }] }],
  };
  return { payload, value };
}

describe("extrairEventosDialog360", () => {
  it("extrai 1 mensagem de um payload válido", () => {
    const { payload, value } = payloadMensagem();
    const eventos = extrairEventosDialog360(payload);
    expect(eventos).toEqual([
      {
        tipoEvento: "mensagem",
        statusEntrega: null,
        mensagemId: "wamid.ABC123",
        telefone: "5511998887777",
        canalTelefone: "552196483003",
        payload: value,
      },
    ]);
  });

  it("extrai N mensagens do mesmo `value`", () => {
    const { payload } = payloadMensagem({
      messages: [
        { from: "5511111111111", id: "wamid.1", type: "text", text: { body: "a" } },
        { from: "5511222222222", id: "wamid.2", type: "text", text: { body: "b" } },
        { from: "5511333333333", id: "wamid.3", type: "text", text: { body: "c" } },
      ],
    });
    const eventos = extrairEventosDialog360(payload);
    expect(eventos).toHaveLength(3);
    expect(eventos.map(e => e.mensagemId)).toEqual(["wamid.1", "wamid.2", "wamid.3"]);
    expect(eventos.every(e => e.tipoEvento === "mensagem")).toBe(true);
  });

  it("extrai statuses sent/delivered/read do mesmo id como eventos separados", () => {
    const { payload } = payloadMensagem({
      messages: undefined,
      statuses: [
        { id: "wamid.ABC123", status: "sent", recipient_id: "5511998887777" },
        { id: "wamid.ABC123", status: "delivered", recipient_id: "5511998887777" },
        { id: "wamid.ABC123", status: "read", recipient_id: "5511998887777" },
      ],
    });
    const eventos = extrairEventosDialog360(payload);
    expect(eventos).toHaveLength(3);
    expect(eventos.map(e => e.statusEntrega)).toEqual(["sent", "delivered", "read"]);
    expect(eventos.every(e => e.mensagemId === "wamid.ABC123")).toBe(true);
    expect(eventos.every(e => e.tipoEvento === "status")).toBe(true);
  });

  it("extrai messages e statuses juntos no mesmo `value`", () => {
    const { payload } = payloadMensagem({
      statuses: [{ id: "wamid.OUTRO", status: "delivered", recipient_id: "5511000000000" }],
    });
    const eventos = extrairEventosDialog360(payload);
    expect(eventos).toHaveLength(2);
    expect(eventos.filter(e => e.tipoEvento === "mensagem")).toHaveLength(1);
    expect(eventos.filter(e => e.tipoEvento === "status")).toHaveLength(1);
  });

  it("extrai canalTelefone de metadata.display_phone_number", () => {
    const { payload } = payloadMensagem();
    const eventos = extrairEventosDialog360(payload);
    expect(eventos[0]!.canalTelefone).toBe("552196483003");
  });

  it("devolve array vazio para payload malformado, sem nunca lançar", () => {
    const malformados: unknown[] = [
      null,
      {},
      { changes: [] }, // entry ausente
      { entry: "não-array" },
      { entry: [{ changes: "não-array" }] },
      { entry: [{ changes: [{ value: undefined }] }] }, // value ausente
      { entry: [{ changes: [{ value: "não-objeto" }] }] },
      { entry: [{ changes: [{ value: { messages: "não-array" } }] }] },
      { entry: [{ changes: [{ value: { statuses: "não-array" } }] }] },
      { entry: [{ changes: [{ value: { messages: [null, "x", 42] } }] }] }, // item não-objeto
      { entry: [{ changes: [{ value: { statuses: [null, "x", 42] } }] }] },
    ];
    for (const m of malformados) {
      expect(() => extrairEventosDialog360(m)).not.toThrow();
      expect(extrairEventosDialog360(m)).toEqual([]);
    }
  });
});

describe("persistirEventosDialog360", () => {
  afterEach(() => {
    insertMock.mockClear();
    insertValuesMock.mockClear();
  });

  it("chama insert(whatsappWebhookEvents).values(...) com as linhas certas para payload válido", async () => {
    const { payload } = payloadMensagem();
    const eventos = extrairEventosDialog360(payload);
    await persistirEventosDialog360(eventos);

    expect(insertMock).toHaveBeenCalledWith(whatsappWebhookEvents);
    expect(insertValuesMock).toHaveBeenCalledWith(eventos);
  });

  it("não chama insert para lista vazia (payload vazio/malformado)", async () => {
    await persistirEventosDialog360([]);
    expect(insertMock).not.toHaveBeenCalled();
    expect(insertValuesMock).not.toHaveBeenCalled();
  });
});

describe("processarWebhookDialog360", () => {
  afterEach(() => {
    insertMock.mockClear();
    insertValuesMock.mockClear();
  });

  it("sem header → 403", () => {
    const r = processarWebhookDialog360(undefined, payloadMensagem().payload, "segredo-certo");
    expect(r).toEqual({ status: 403, corpo: { error: "Forbidden" } });
  });

  it("header errado → 403", () => {
    const r = processarWebhookDialog360(
      "segredo-errado",
      payloadMensagem().payload,
      "segredo-certo",
    );
    expect(r).toEqual({ status: 403, corpo: { error: "Forbidden" } });
  });

  it("segredoEsperado vazio, mesmo com header presente → 403 (fail-closed)", () => {
    const r = processarWebhookDialog360("qualquer-coisa", payloadMensagem().payload, "");
    expect(r).toEqual({ status: 403, corpo: { error: "Forbidden" } });
  });

  it("header correto → 200 { received: true }", () => {
    const r = processarWebhookDialog360(
      "segredo-certo",
      payloadMensagem().payload,
      "segredo-certo",
    );
    expect(r).toEqual({ status: 200, corpo: { received: true } });
  });

  it("a chamada retorna de forma SÍNCRONA (não é uma Promise) — nunca espera a persistência", () => {
    const r = processarWebhookDialog360(
      "segredo-certo",
      payloadMensagem().payload,
      "segredo-certo",
    );
    expect(r).not.toBeInstanceOf(Promise);
    expect(r.status).toBe(200);
  });

  it("header correto + payload malformado → ainda 200", () => {
    const casos: unknown[] = [null, {}, { entry: "não-array" }];
    for (const body of casos) {
      const r = processarWebhookDialog360("segredo-certo", body, "segredo-certo");
      expect(r).toEqual({ status: 200, corpo: { received: true } });
    }
  });
});

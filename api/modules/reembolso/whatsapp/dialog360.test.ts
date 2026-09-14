import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  autenticarWebhookDialog360,
  extrairEventosDialog360,
  processarWebhookDialog360,
} from "./dialog360";
const state = vi.hoisted(() => ({ transaction: vi.fn(), values: vi.fn() }));
vi.mock("../../../queries/connection", () => ({
  getDb: () => ({ transaction: state.transaction }),
}));
const payload = {
  entry: [
    {
      changes: [
        {
          value: {
            metadata: { display_phone_number: "552196483003" },
            messages: [
              {
                id: "wamid.test",
                from: "5511999999999",
                timestamp: "1717000000",
                type: "text",
                text: { body: "oi" },
              },
            ],
          },
        },
      ],
    },
  ],
};
beforeEach(() => {
  vi.clearAllMocks();
  state.values.mockResolvedValue([{ affectedRows: 1 }]);
  state.transaction.mockImplementation(async fn =>
    fn({
      insert: () => ({
        ignore: () => ({ values: state.values }),
        values: state.values,
      }),
    })
  );
});
describe("ingresso durável 360dialog", () => {
  it("nega ausência/erro de autenticação antes DB", async () => {
    for (const [header, secret] of [
      [undefined, "test"],
      ["bad", "test"],
      ["test", undefined],
      [" ", " "],
    ]) {
      expect(autenticarWebhookDialog360(header, secret)).toBe(false);
      expect(
        (await processarWebhookDialog360(header, payload, secret)).status
      ).toBe(403);
    }
    expect(state.transaction).not.toHaveBeenCalled();
  });
  it("aguarda commit antes ACK", async () => {
    let finish!: () => void;
    state.transaction.mockImplementation(
      () =>
        new Promise<void>(resolve => {
          finish = resolve;
        })
    );
    let done = false;
    const pending = processarWebhookDialog360("test", payload, "test").then(
      r => {
        done = true;
        return r;
      }
    );
    await Promise.resolve();
    expect(done).toBe(false);
    finish();
    expect((await pending).status).toBe(200);
  });
  it("falha DB retorna 503 recuperável", async () => {
    state.transaction.mockRejectedValue(new Error("sensitive database detail"));
    expect(await processarWebhookDialog360("test", payload, "test")).toEqual({
      status: 503,
      corpo: { error: "Temporarily unavailable" },
    });
  });
  it("reentrega deduplicada não cria outro log", async () => {
    state.values.mockResolvedValue([{ affectedRows: 0 }]);
    expect(
      (await processarWebhookDialog360("test", payload, "test")).status
    ).toBe(200);
    expect(state.values).toHaveBeenCalledTimes(1);
  });
  it("valida IDs e tamanho de lote antes persistir", async () => {
    const invalid = structuredClone(payload);
    invalid.entry[0]!.changes[0]!.value.messages[0]!.id = "";
    expect(
      (await processarWebhookDialog360("test", invalid, "test")).status
    ).toBe(400);
    expect((await processarWebhookDialog360("test", null, "test")).status).toBe(
      400
    );
    expect(state.transaction).not.toHaveBeenCalled();
  });
  it("extrai mensagens e statuses e ignora formatos não eventos", () => {
    expect(extrairEventosDialog360(null)).toEqual([]);
    expect(extrairEventosDialog360({ entry: "bad" })).toEqual([]);
    const result = extrairEventosDialog360(payload);
    expect(result[0]?.mensagemId).toBe("wamid.test");
    expect(
      extrairEventosDialog360({
        entry: [
          {
            changes: [
              { value: { statuses: [{ id: "wamid.test", status: "read" }] } },
            ],
          },
        ],
      })[0]?.statusEntrega
    ).toBe("read");
  });
});

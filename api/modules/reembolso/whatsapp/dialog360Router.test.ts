import { expect, it, vi } from "vitest";
import { criarRouterWebhookDialog360 } from "./dialog360Router";
vi.mock("../../../queries/connection", () => ({
  getDb: vi.fn(() => {
    throw new Error("DB não permitido neste teste");
  }),
}));
it("nega corpo inválido antes do parser e persistência", async () => {
  const processar = vi.fn();
  const app = criarRouterWebhookDialog360("dummy", processar);
  const r = await app.request("/api/webhooks/360dialog", {
    method: "POST",
    body: "not JSON",
  });
  expect(r.status).toBe(403);
  expect(processar).not.toHaveBeenCalled();
});
it("limita payload autenticado a 1MB sem chamar persistência", async () => {
  const processar = vi.fn();
  const app = criarRouterWebhookDialog360("dummy", processar);
  const r = await app.request("/api/webhooks/360dialog", {
    method: "POST",
    headers: { Authorization: "dummy" },
    body: "x".repeat(1024 * 1024 + 1),
  });
  expect(r.status).toBe(413);
  expect(processar).not.toHaveBeenCalled();
});
it("propaga falha durável 503 e resposta sanitizada", async () => {
  const processar = vi.fn().mockResolvedValue({
    status: 503,
    corpo: { error: "Temporarily unavailable" },
  });
  const app = criarRouterWebhookDialog360("dummy", processar);
  const r = await app.request("/api/webhooks/360dialog", {
    method: "POST",
    headers: { Authorization: "dummy" },
    body: "{}",
  });
  expect(r.status).toBe(503);
  expect(await r.json()).toEqual({ error: "Temporarily unavailable" });
});
it("timeout não acusa ACK antes de transação lenta", async () => {
  vi.useFakeTimers();
  try {
    const processar = vi.fn().mockImplementation(() => new Promise(() => {}));
    const app = criarRouterWebhookDialog360("dummy", processar);
    const response = app.request("/api/webhooks/360dialog", {
      method: "POST",
      headers: { Authorization: "dummy" },
      body: "{}",
    });
    await vi.waitFor(() => expect(processar).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(4_001);
    expect((await response).status).toBe(503);
  } finally {
    vi.useRealTimers();
  }
});

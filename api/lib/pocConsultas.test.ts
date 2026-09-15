import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { instalarLimiteChamadasPoc, ReservaConsultaPocIndisponivel, saldoChamadasPoc } from "./pocConsultas";
const dirs: string[] = [];
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true }); });
function ledger(limite = 2) {
  const dir = mkdtempSync(join(tmpdir(), "poc-budget-")); dirs.push(dir);
  const arquivo = join(dir, "calls.jsonl"); writeFileSync(arquivo, "", { mode: 0o600 });
  vi.stubEnv("POC_CALLS_LEDGER", arquivo); vi.stubEnv("POC_CALLS_LIMIT", String(limite)); return arquivo;
}
it("WhatsApp, OpenAI e OpenRouter compartilham limite persistido; falha e reinício não devolvem saldo", async () => {
  const arquivo = ledger(3);
  const network = vi.fn()
    .mockResolvedValueOnce(new Response("ok"))
    .mockRejectedValueOnce(new Error("network"))
    .mockResolvedValueOnce(new Response("ok"));
  vi.stubGlobal("fetch", network); instalarLimiteChamadasPoc();
  await fetch("https://waba-v2.360dialog.io/messages");
  await expect(fetch("https://api.openai.com/v1/responses")).rejects.toThrow("network");
  await fetch("https://openrouter.ai/api/v1/chat/completions");
  expect(saldoChamadasPoc()).toBe(0);
  vi.stubGlobal("fetch", network); instalarLimiteChamadasPoc();
  await expect(fetch("https://waba-v2.360dialog.io/messages")).rejects.toBeInstanceOf(ReservaConsultaPocIndisponivel);
  expect(network).toHaveBeenCalledTimes(3);
  const registros = readFileSync(arquivo, "utf8").trim().split("\n").map(line => JSON.parse(line));
  expect(registros.map(r => [r.consulta, r.destino])).toEqual([[1, "360dialog"], [2, "openai"], [3, "openrouter"]]);
});
it("ledger adulterado impede iniciar controle e nunca chama provedor", () => {
  const arquivo = ledger(); writeFileSync(arquivo, '{"consulta":3,"cenario":"fixture","destino":"openai"}\n');
  const network = vi.fn(); vi.stubGlobal("fetch", network);
  expect(saldoChamadasPoc()).toBe(0);
  expect(instalarLimiteChamadasPoc).toThrow();
  expect(network).not.toHaveBeenCalled();
});

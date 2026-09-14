import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { instalarLimiteChamadasPoc, ReservaConsultaPocIndisponivel, saldoChamadasPoc } from "./pocConsultas";
const dirs: string[] = [];
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true }); });
function ledger() {
  const dir = mkdtempSync(join(tmpdir(), "poc-budget-")); dirs.push(dir);
  const arquivo = join(dir, "calls.jsonl"); writeFileSync(arquivo, "", { mode: 0o600 });
  vi.stubEnv("POC_CALLS_LEDGER", arquivo); vi.stubEnv("POC_CALLS_LIMIT", "2"); return arquivo;
}
it("WhatsApp e OpenAI compartilham limite persistido; falha e reinício não devolvem saldo", async () => {
  const arquivo = ledger();
  const network = vi.fn().mockResolvedValueOnce(new Response("ok")).mockRejectedValueOnce(new Error("network"));
  vi.stubGlobal("fetch", network); instalarLimiteChamadasPoc();
  await fetch("https://waba-v2.360dialog.io/messages");
  await expect(fetch("https://api.openai.com/v1/responses")).rejects.toThrow("network");
  expect(saldoChamadasPoc()).toBe(0);
  vi.stubGlobal("fetch", network); instalarLimiteChamadasPoc();
  await expect(fetch("https://waba-v2.360dialog.io/messages")).rejects.toBeInstanceOf(ReservaConsultaPocIndisponivel);
  expect(network).toHaveBeenCalledTimes(2);
  const registros = readFileSync(arquivo, "utf8").trim().split("\n").map(line => JSON.parse(line));
  expect(registros.map(r => [r.consulta, r.destino])).toEqual([[1, "360dialog"], [2, "openai"]]);
});
it("ledger adulterado impede iniciar controle e nunca chama provedor", () => {
  const arquivo = ledger(); writeFileSync(arquivo, '{"consulta":3,"cenario":"fixture","destino":"openai"}\n');
  const network = vi.fn(); vi.stubGlobal("fetch", network);
  expect(saldoChamadasPoc()).toBe(0);
  expect(instalarLimiteChamadasPoc).toThrow();
  expect(network).not.toHaveBeenCalled();
});

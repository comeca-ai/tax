import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
// @ts-expect-error ferramenta operacional JavaScript
import { reservarConsulta, criarFetchLimitado } from "./limite-consultas.mjs";

const pastas: string[] = [];
function arquivo() { const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "poc-cota-")); pastas.push(pasta); return path.join(pasta, "registro.jsonl"); }
afterEach(() => { for (const pasta of pastas.splice(0)) fs.rmSync(pasta, { recursive: true }); });

describe("cota compartilhada dos ensaios externos", () => {
  it("persiste reservas e impede a vigésima primeira chamada", () => {
    const alvo = arquivo();
    for (let i = 1; i <= 20; i++) expect(reservarConsulta(alvo, "sintetico", "openai").consulta).toBe(i);
    expect(() => reservarConsulta(alvo, "sintetico", "openai")).toThrow("20 consultas");
    expect(fs.statSync(alvo).mode & 0o777).toBe(0o600);
  });
  it("falha fechada em registro corrupto ou operação concorrente", () => {
    const alvo = arquivo(); fs.writeFileSync(alvo, "invalido\n", { mode: 0o600 });
    expect(() => reservarConsulta(alvo, "sintetico", "openai")).toThrow();
    fs.writeFileSync(`${alvo}.lock`, "", { mode: 0o600 });
    expect(() => reservarConsulta(alvo, "sintetico", "openai")).toThrow();
  });
  it("não segue symlink nem aceita permissões públicas", () => {
    const alvo = arquivo(); fs.writeFileSync(`${alvo}.real`, "", { mode: 0o600 }); fs.symlinkSync(`${alvo}.real`, alvo);
    expect(() => reservarConsulta(alvo, "sintetico", "openai")).toThrow();
    fs.unlinkSync(alvo); fs.writeFileSync(alvo, "", { mode: 0o644 });
    expect(() => reservarConsulta(alvo, "sintetico", "openai")).toThrow("inseguro");
  });
  it("contabiliza falha de rede sem retry e bloqueia fallback para outro host", async () => {
    const alvo = arquivo(), executar = vi.fn().mockRejectedValue(new Error("conteudo sensivel"));
    const fetch = criarFetchLimitado({ arquivo: alvo, cenario: () => "ocr_sintetico", executar });
    const init = { method: "POST", body: JSON.stringify({ store: false, max_output_tokens: 2000 }) };
    await expect(fetch("https://api.openai.com/v1/responses", init)).rejects.toThrow("indisponível");
    await expect(fetch("https://api.mistral.ai/v1/ocr", init)).rejects.toThrow("fora");
    expect(executar).toHaveBeenCalledOnce();
    expect(JSON.parse(fs.readFileSync(alvo, "utf8")).consulta).toBe(1);
  });
});

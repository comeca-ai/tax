import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
const source = readFileSync(".github/workflows/verificar-secrets-maps.yml", "utf8");
const script = source.match(/node --input-type=module <<'NODE'\n([\s\S]*?)\n\s*NODE/)![1].replace(/import \{ appendFileSync \} from 'node:fs';/, "");

describe("presença Maps sem vazamento nem rede", () => {
  it.each([true, false])("presença %s imprime só resultado booleano", presente => {
    const token = "synthetic-maps-key-never-print";
    let summary = "";
    const process = { env: { GOOGLE_MAPS_API_KEY: presente ? token : "", POC_MAPS_ENABLED: "true", GITHUB_STEP_SUMMARY: "synthetic-summary" }, exitCode: 0 };
    runInNewContext(script, { process, appendFileSync: (_path: string, text: string) => { summary += text; } });
    expect(summary).not.toContain(token);
    expect(summary).toContain(presente ? "configurada" : "ausente");
    expect(process.exitCode).toBe(presente ? 0 : 1);
    expect(source).not.toContain("https://routes.googleapis.com");
  });
  it("container recebe chave somente em runtime e flag permanece opt-in", () => {
    const compose = readFileSync("docker-compose.yml", "utf8");
    expect(compose).toContain("GOOGLE_MAPS_API_KEY: ${GOOGLE_MAPS_API_KEY:-}");
    expect(compose).toContain("POC_MAPS_ENABLED: ${POC_MAPS_ENABLED:-false}");
    expect(source).toContain("secrets.GOOGLE_MAPS_API_KEY");
    expect(source).toContain("environment: homologacao");
  });
});

import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "src"),
      "@contracts": path.resolve(templateRoot, "contracts"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    // A imagem roda com NODE_ENV=production (é assim que os testes rodam neste
    // servidor) e `api/lib/env.ts` exige as variáveis nesse modo — sem isto,
    // qualquer teste que importe `env` falha só aqui, e o de sessão é um deles.
    env: {
      APP_ID: "vitest",
      APP_SECRET: "vitest-app-secret",
      DATABASE_URL: "mysql://vitest:vitest@127.0.0.1:3306/vitest",
    },
    include: [
      "db/**/*.test.ts",
      "api/**/*.test.ts",
      "api/**/*.spec.ts",
      "contracts/**/*.test.ts",
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
    ],
  },
});

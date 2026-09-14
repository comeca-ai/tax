import { describe, expect, it } from "vitest";
import { senhaDemoAutorizada } from "./seed-policy";

describe("autorização dos dados demo", () => {
  it.each([undefined, "", "production", "development", "test"])(
    "desabilita demo por padrão em %s",
    NODE_ENV => {
      expect(senhaDemoAutorizada({ NODE_ENV })).toBeNull();
    }
  );
  it.each([undefined, "", "production", "staging"])(
    "nega flag demo fora de ambiente explicitamente local: %s",
    NODE_ENV => {
      expect(() =>
        senhaDemoAutorizada({
          NODE_ENV,
          SEED_DEMO: "true",
          SEED_DEMO_PASSWORD: "synthetic-test-only-password",
        })
      ).toThrow(/development ou test/);
    }
  );
  it.each([undefined, "", "short", "            "])(
    "nega senha ausente, curta ou branca",
    SEED_DEMO_PASSWORD => {
      expect(() =>
        senhaDemoAutorizada({
          NODE_ENV: "development",
          SEED_DEMO: "true",
          SEED_DEMO_PASSWORD,
        })
      ).toThrow(/fornecida explicitamente/);
    }
  );
  it.each(["development", "test"])(
    "permite demo somente com flag e senha explícitas em %s",
    NODE_ENV => {
      const supplied = "synthetic-test-only-password";
      expect(
        senhaDemoAutorizada({
          NODE_ENV,
          SEED_DEMO: "true",
          SEED_DEMO_PASSWORD: supplied,
        })
      ).toBe(supplied);
    }
  );
  it("não interpreta valores parecidos com true como autorização", () => {
    expect(
      senhaDemoAutorizada({
        NODE_ENV: "development",
        SEED_DEMO: "TRUE",
        SEED_DEMO_PASSWORD: "synthetic-test-only-password",
      })
    ).toBeNull();
  });
});

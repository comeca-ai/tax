import { afterEach, expect, it, vi } from "vitest";
import {
  empresasDoCanal,
  incluirConvidadosPermitidos,
} from "./convidadosPermitidos";
const mock = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("../../../queries/connection", () => ({ getDb: mock.get }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it("sem empresas autorizadas mantém somente os números explícitos e não consulta o banco", async () => {
  vi.stubEnv("WHATSAPP_POC_ALLOWED_COMPANIES", "");
  expect([
    ...(await incluirConvidadosPermitidos(new Set(["5511999999999"]))),
  ]).toEqual(["5511999999999"]);
  expect(mock.get).not.toHaveBeenCalled();
});
it.each(["1,abc", "0", "-1", "1.2", "1,", "999999999999999999"])(
  "escopo inválido não expande canal: %s",
  valor => expect(empresasDoCanal(valor)).toEqual([])
);
it("deduplica somente empresas inteiras autorizadas", () =>
  expect(empresasDoCanal("1, 2,1")).toEqual([1, 2]));

import { describe, expect, it } from "vitest";
import { filterHistory } from "./history";

const LOG = `
2b75be2 docs: D-015 exclusão = anonimização
e051aa5 merge: norma-0009 FK composta delegação×despesa
abc1234 feat: webhook whatsapp de reembolso
def5678 chore: bump deps
`;

describe("filterHistory", () => {
  it("mantém só commits do domínio de reembolso", () => {
    const items = filterHistory(LOG);
    expect(items.map((i) => i.hash)).toEqual(["e051aa5", "abc1234"]);
    expect(items[1].subject).toBe("feat: webhook whatsapp de reembolso");
  });

  it("retorna vazio para log vazio", () => {
    expect(filterHistory("")).toEqual([]);
  });
});

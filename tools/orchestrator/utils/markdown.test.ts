import { describe, expect, it } from "vitest";
import { mdCell, mdHeader, mdTable } from "./markdown";

describe("mdCell", () => {
  it("escapa pipes para não quebrar a tabela", () => {
    expect(mdCell("a | b")).toBe("a \\| b");
  });

  it("achata quebras de linha", () => {
    expect(mdCell("linha1\nlinha2\r\nlinha3")).toBe("linha1 linha2 linha3");
  });
});

describe("mdTable", () => {
  it("monta cabeçalho, separador e linhas", () => {
    const out = mdTable(["A", "B"], [["1", "2"], ["3", "4"]]);
    expect(out).toBe(
      ["| A | B |", "| --- | --- |", "| 1 | 2 |", "| 3 | 4 |"].join("\n"),
    );
  });

  it("funciona sem linhas", () => {
    const out = mdTable(["A"], []);
    expect(out.trimEnd()).toBe("| A |\n| --- |");
  });
});

describe("mdHeader", () => {
  it("inclui título, data e aviso de regeneração", () => {
    const out = mdHeader("Título", "2026-09-12T00:00:00.000Z");
    expect(out).toContain("# Título");
    expect(out).toContain("2026-09-12T00:00:00.000Z");
    expect(out).toContain("pnpm audit:run");
  });
});

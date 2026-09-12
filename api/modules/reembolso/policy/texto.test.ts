import { describe, expect, it } from "vitest";
import { truncarUtf8 } from "./texto";

describe("truncarUtf8", () => {
  it("devolve a mesma string quando cabe no limite", () => {
    expect(truncarUtf8("política", 100)).toBe("política");
  });

  it("não parte caractere multibyte (ç/ã) no corte", () => {
    const texto = "ação".repeat(50); // "ação" = 6 bytes
    for (const max of [7, 8, 9, 10, 11, 13]) {
      const r = truncarUtf8(texto, max);
      expect(Buffer.byteLength(r, "utf8")).toBeLessThanOrEqual(max);
      expect(r.includes("�")).toBe(false);
      expect(Buffer.from(r, "utf8").toString("utf8")).toBe(r);
      expect(texto.startsWith(r)).toBe(true);
    }
  });

  it("recua até 3 posições num emoji de 4 bytes", () => {
    const texto = "ab😀cd"; // a b [4 bytes] c d
    expect(truncarUtf8(texto, 3)).toBe("ab");
    expect(truncarUtf8(texto, 4)).toBe("ab");
    expect(truncarUtf8(texto, 5)).toBe("ab");
    expect(truncarUtf8(texto, 6)).toBe("ab😀");
  });

  it("string vazia devolve vazio", () => {
    expect(truncarUtf8("", 10)).toBe("");
  });

  it("maxBytes = 0 devolve vazio", () => {
    expect(truncarUtf8("abc", 0)).toBe("");
  });

  it("exatamente no limite fica inalterada", () => {
    const texto = "ação"; // 6 bytes
    expect(truncarUtf8(texto, 6)).toBe(texto);
  });
});

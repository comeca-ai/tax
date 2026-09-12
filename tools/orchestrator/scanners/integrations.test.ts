import { describe, expect, it } from "vitest";
import { countOccurrences, detectIntegrations } from "./integrations";

describe("countOccurrences", () => {
  it("conta case-insensitive", () => {
    expect(countOccurrences("WhatsApp e whatsapp", "whatsapp")).toBe(2);
  });

  it("escapa caracteres especiais de regex", () => {
    expect(countOccurrences("pdf-parse pdf-parse", "pdf-parse")).toBe(2);
  });
});

describe("detectIntegrations", () => {
  it("detecta domínios por termo e ordena por domínio/arquivo", () => {
    const files = new Map([
      ["b.ts", "envia mensagem no whatsapp"],
      ["a.ts", "OCR com DANFE e whatsapp"],
    ]);
    const items = detectIntegrations(files, {
      ocr: ["ocr", "danfe"],
      whatsapp: ["whatsapp"],
    });
    expect(items).toEqual([
      { domain: "ocr", term: "ocr", file: "a.ts", occurrences: 1 },
      { domain: "ocr", term: "danfe", file: "a.ts", occurrences: 1 },
      { domain: "whatsapp", term: "whatsapp", file: "a.ts", occurrences: 1 },
      { domain: "whatsapp", term: "whatsapp", file: "b.ts", occurrences: 1 },
    ]);
  });

  it("retorna vazio quando nenhum termo aparece", () => {
    expect(detectIntegrations(new Map([["x.ts", "nada aqui"]]))).toEqual([]);
  });
});

import { readText } from "../utils/fs";
import type { IntegrationItem } from "../types";

/**
 * Catálogo de termos que sinalizam integrações externas por domínio.
 * A varredura é lexical (case-insensitive) sobre uma lista fixa de
 * arquivos quentes do projeto — deliberadamente simples e determinística.
 */
export const INTEGRATION_TERMS: Record<string, string[]> = {
  whatsapp: ["whatsapp", "evolution"],
  ocr: ["ocr", "danfe", "visao", "pdf-parse"],
  email: ["nodemailer", "convite", "smtp"],
  receita: ["receita", "perdcomp", "ecac", "cnpj"],
  llm: ["gemini", "openai", "llm"],
};

/** Arquivos/diretórios quentes inspecionados pelo scanner. */
export const HOT_PATHS = [
  "api/modules/reembolso/whatsapp/evolution.ts",
  "api/modules/fiscal/ocr/visao.ts",
  "api/lib/conviteAcesso.ts",
  "api/mail",
  "src/lib/whatsapp.ts",
  "src/lib/cnpj.ts",
  "db/schema.ts",
];

/** Conta ocorrências case-insensitive de um termo num texto. */
export function countOccurrences(content: string, term: string): number {
  const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  return (content.match(re) ?? []).length;
}

/**
 * Detecta integrações por termo sobre um mapa arquivo→conteúdo.
 * Função pura para testabilidade.
 */
export function detectIntegrations(
  files: Map<string, string>,
  terms: Record<string, string[]> = INTEGRATION_TERMS,
): IntegrationItem[] {
  const items: IntegrationItem[] = [];
  for (const [file, content] of files) {
    for (const [domain, domainTerms] of Object.entries(terms)) {
      for (const term of domainTerms) {
        const occurrences = countOccurrences(content, term);
        if (occurrences > 0) items.push({ domain, term, file, occurrences });
      }
    }
  }
  return items.sort(
    (a, b) => a.domain.localeCompare(b.domain) || a.file.localeCompare(b.file),
  );
}

/** Varre os arquivos quentes do projeto em busca de integrações. */
export async function scanIntegrations(root: string): Promise<IntegrationItem[]> {
  const files = new Map<string, string>();
  for (const file of HOT_PATHS) {
    try {
      files.set(file, await readText(`${root}/${file}`));
    } catch {
      // Arquivo ausente (ex.: diretório `api/mail`) — ignorado.
    }
  }
  return detectIntegrations(files);
}

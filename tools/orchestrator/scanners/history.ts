import { git } from "../utils/git";
import type { HistoryItem } from "../types";

const HISTORY_KEYWORDS = [
  "reembolso",
  "ocr",
  "whatsapp",
  "despesa",
  "politica",
  "convite",
  "fiscal",
];

const DEFAULT_LIMIT = 50;

/**
 * Filtra commits cujo assunto toca o domínio de reembolso.
 * Função pura para testabilidade.
 */
export function filterHistory(
  log: string,
  keywords: string[] = HISTORY_KEYWORDS,
): HistoryItem[] {
  return log
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [hash, ...rest] = l.split(" ");
      return { hash, subject: rest.join(" ") };
    })
    .filter((item) =>
      keywords.some((k) => item.subject.toLowerCase().includes(k)),
    );
}

/** Lê o histórico de commits relevantes do clone atual. */
export async function scanHistory(
  root: string,
  limit = DEFAULT_LIMIT,
): Promise<HistoryItem[]> {
  try {
    const log = await git(
      ["log", `--max-count=${limit}`, "--format=%h %s"],
      root,
    );
    return filterHistory(log);
  } catch {
    return [];
  }
}

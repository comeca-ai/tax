import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/** Garante que um diretório exista (cria recursivamente). */
export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

/** Lê um arquivo de texto em UTF-8. */
export async function readText(file: string): Promise<string> {
  return readFile(file, "utf8");
}

/**
 * Escreve um arquivo de texto, criando o diretório pai se necessário.
 * Retorna o caminho escrito (útil para logs do runner).
 */
export async function writeText(file: string, content: string): Promise<string> {
  await ensureDir(path.dirname(file));
  await writeFile(file, content, "utf8");
  return file;
}

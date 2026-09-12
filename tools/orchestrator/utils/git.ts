import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Executa um comando git na raiz do repositório e devolve stdout.
 * Lança erro com stderr anexado quando o comando falha — os scanners
 * decidem se o erro é fatal ou se caem num fallback.
 */
export async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout;
}

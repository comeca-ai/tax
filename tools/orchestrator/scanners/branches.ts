import { git } from "../utils/git";
import type { BranchItem } from "../types";

/**
 * Lista branches locais e remotas conhecidas pelo clone atual.
 *
 * Em clones shallow de CI só existe a branch em checkout; nesse caso o
 * relatório marca `source: "local"` e o inventário de branches remotas
 * completo fica a cargo do relatório estático `docs/auditoria/00-repositorios.md`.
 */
export async function scanBranches(root: string): Promise<BranchItem[]> {
  const items = new Map<string, BranchItem>();

  try {
    const current = (await git(["rev-parse", "--abbrev-ref", "HEAD"], root)).trim();

    const locals = await git(["branch", "--format=%(refname:short)"], root);
    for (const name of locals.split("\n").map((l) => l.trim()).filter(Boolean)) {
      items.set(`local:${name}`, { name, source: "local", current: name === current });
    }

    const remotes = await git(["branch", "-r", "--format=%(refname:short)"], root);
    for (const raw of remotes.split("\n").map((l) => l.trim()).filter(Boolean)) {
      if (raw.endsWith("/HEAD")) continue;
      const name = raw.replace(/^[^/]+\//, "");
      items.set(`remote:${name}`, { name, source: "remote", current: false });
    }
  } catch {
    // Sem git disponível (ex.: diretório copiado sem .git) — devolve vazio.
  }

  return [...items.values()].sort((a, b) => a.name.localeCompare(b.name));
}

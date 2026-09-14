/** Compatibilidade restrita ao nono dígito de celular BR no remetente autenticado do canal. */
export function variantesTelefoneCanal(telefone: string): string[] {
  if (!/^[1-9]\d{7,14}$/.test(telefone)) return [];
  if (/^55[1-9]\d[6-9]\d{7}$/.test(telefone)) return [telefone, `${telefone.slice(0, 4)}9${telefone.slice(4)}`];
  if (/^55[1-9]\d9[6-9]\d{7}$/.test(telefone)) return [telefone, telefone.slice(0, 4) + telefone.slice(5)];
  return [telefone];
}

export function remetentePermitido(telefone: string, permitidos: Set<string>): boolean {
  return variantesTelefoneCanal(telefone).some(p => permitidos.has(p));
}

type Vinculo = { empresaId: number; colaboradorId: number; situacao: string };
export async function resolverRemetenteCanal<T extends Vinculo>(telefone: string, permitidos: Set<string>, resolver: (telefone: string) => Promise<T[]>): Promise<(T & { telefoneCadastro: string }) | null> {
  const variantes = variantesTelefoneCanal(telefone);
  if (!variantes.some(p => permitidos.has(p))) return null;
  // Busca ambas mesmo quando a primeira existe: colisão entre cadastros impede associação.
  const encontrados = (await Promise.all(variantes.map(async p => (await resolver(p)).filter(v => v.situacao === "ativo").map(v => ({ ...v, telefoneCadastro: p }))))).flat();
  const identidades = new Map(encontrados.map(v => [`${v.empresaId}:${v.colaboradorId}`, v]));
  if (identidades.size !== 1) return null;
  const unico = [...identidades.values()][0];
  return permitidos.has(unico.telefoneCadastro) ? unico : null;
}

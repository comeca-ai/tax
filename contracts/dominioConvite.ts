import { z } from "zod";

export function dominioEmail(email: string | null | undefined): string | null {
  const parsed = z.email().safeParse(email?.trim().toLowerCase());
  return parsed.success
    ? parsed.data.slice(parsed.data.lastIndexOf("@") + 1)
    : null;
}
export function emailDoDominio(email: string, dominio: string): boolean {
  return dominioEmail(email) === dominio;
}
export function mensagemDominioConvite(dominio: string): string {
  return `Use um e-mail com o domínio @${dominio}, igual ao do administrador da empresa.`;
}

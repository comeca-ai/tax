import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { usuarios } from "../../db/schema";
import {
  dominioEmail,
  emailDoDominio,
  mensagemDominioConvite,
} from "../../contracts/dominioConvite";
import type { getDb } from "../queries/connection";

export async function dominioAdministrador(
  db: Pick<ReturnType<typeof getDb>, "select">,
  usuarioId: number
): Promise<string> {
  const [usuario] = await db
    .select({ email: usuarios.email })
    .from(usuarios)
    .where(eq(usuarios.id, usuarioId))
    .limit(1);
  const dominio = dominioEmail(usuario?.email);
  if (!dominio)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Confira o e-mail cadastrado pelo administrador antes de convidar pessoas.",
    });
  return dominio;
}
export function exigirDominioConvite(email: string, dominio: string): void {
  if (!emailDoDominio(email, dominio))
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: mensagemDominioConvite(dominio),
    });
}

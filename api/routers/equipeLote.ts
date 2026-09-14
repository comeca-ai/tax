import { dominioAdministrador } from "../lib/dominioConvite";
import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  arquivoEquipeSchema,
  validarEquipeCsv,
} from "../../contracts/equipeLote";
import { colaboradores, empresas, logAuditoria } from "../../db/schema";
import { equipeLotes } from "../../db/equipeSchema";
import { createRouter, protectedProcedure } from "../middleware";
import { getDb } from "../queries/connection";
import { env } from "../lib/env";
import { assertAdminDaEmpresa } from "./_shared";
import { enviarConviteColaboradorIdempotente } from "../modules/reembolso/convites/servico";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const assinar = (s: string) =>
  createHmac("sha256", env.appSecret)
    .update("equipe-previa-v1\0" + s)
    .digest("hex");
function tokenPrevia(
  input: { empresaId: number; csv: string },
  usuarioId: number
) {
  const payload = Buffer.from(
    JSON.stringify({
      empresaId: input.empresaId,
      usuarioId,
      hash: sha(input.csv),
      exp: Date.now() + 30 * 60_000,
      nonce: randomUUID(),
    })
  ).toString("base64url");
  return payload + "." + assinar(payload);
}
function validarToken(
  token: string,
  input: { empresaId: number; csv: string },
  usuarioId: number
) {
  try {
    const parts = token.split(".");
    if (parts.length !== 2 || !/^[a-f0-9]{64}$/.test(parts[1]))
      throw new Error();
    if (
      !timingSafeEqual(
        Buffer.from(parts[1], "hex"),
        Buffer.from(assinar(parts[0]), "hex")
      )
    )
      throw new Error();
    const p = JSON.parse(Buffer.from(parts[0], "base64url").toString());
    if (
      p.empresaId !== input.empresaId ||
      p.usuarioId !== usuarioId ||
      p.hash !== sha(input.csv) ||
      !Number.isFinite(p.exp) ||
      p.exp <= Date.now()
    )
      throw new Error();
  } catch {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Prévia inválida ou expirada. Valide a planilha novamente.",
    });
  }
}
function validar(
  csv: string,
  pessoas: Parameters<typeof validarEquipeCsv>[1],
  dominio: string
) {
  try {
    return validarEquipeCsv(csv, pessoas, dominio);
  } catch {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "CSV inválido. Use o modelo UTF-8 com 1 a 100 pessoas e confira o cabeçalho e as aspas.",
    });
  }
}
export const equipeLoteRouter = createRouter({
  previa: protectedProcedure
    .input(arquivoEquipeSchema)
    .mutation(async ({ input, ctx }) => {
      const empresa = await assertAdminDaEmpresa(ctx, input.empresaId);
      const existentes = await getDb()
        .select()
        .from(colaboradores)
        .where(eq(colaboradores.empresaId, input.empresaId));
      const resultado = validar(
        input.csv,
        existentes,
        await dominioAdministrador(getDb(), empresa.usuarioId)
      );
      return {
        ...resultado,
        token: resultado.erros.length
          ? null
          : tokenPrevia(input, ctx.usuario.id),
      };
    }),
  confirmar: protectedProcedure
    .input(
      arquivoEquipeSchema.extend({
        token: z.string().min(1).max(2048),
        confirmacao: z.literal(true),
        enviarConvites: z.boolean().default(false),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const empresa = await assertAdminDaEmpresa(ctx, input.empresaId);
      validarToken(input.token, input, ctx.usuario.id);
      const db = getDb(),
        chave = sha(input.token);
      const lote = await db.transaction(async tx => {
        await tx
          .select({ id: empresas.id })
          .from(empresas)
          .where(eq(empresas.id, input.empresaId))
          .for("update");
        const [anterior] = await tx
          .select()
          .from(equipeLotes)
          .where(
            and(
              eq(equipeLotes.empresaId, input.empresaId),
              eq(equipeLotes.chave, chave)
            )
          )
          .for("update");
        if (anterior)
          return {
            id: anterior.id,
            pessoas: anterior.pessoas,
            idempotente: true,
          };
        const existentes = await tx
          .select()
          .from(colaboradores)
          .where(eq(colaboradores.empresaId, input.empresaId))
          .for("update");
        const resultado = validar(
          input.csv,
          existentes,
          await dominioAdministrador(tx, empresa.usuarioId)
        );
        if (resultado.erros.length)
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "O cadastro mudou ou a planilha contém erros. Gere uma nova prévia; nenhuma pessoa foi importada.",
          });
        const ids: number[] = [],
          porMatricula = new Map(
            existentes
              .filter(p => p.statusVinculo === "ativo" && p.matricula)
              .map(p => [p.matricula!.trim().toUpperCase(), p.id])
          );
        for (const { pessoa } of resultado.linhas) {
          const [r] = await tx.insert(colaboradores).values({
            empresaId: input.empresaId,
            nome: pessoa.nome,
            email: pessoa.email,
            telefone: pessoa.telefone.slice(1),
            matricula: pessoa.matricula,
            tipoVinculo: pessoa.vinculo,
            equipe: pessoa.equipe,
          });
          ids.push(r.insertId);
          porMatricula.set(pessoa.matricula, r.insertId);
        }
        for (const { pessoa } of resultado.linhas) {
          if (pessoa.superiorMatricula)
            await tx
              .update(colaboradores)
              .set({
                superiorDiretoId: porMatricula.get(pessoa.superiorMatricula)!,
              })
              .where(
                and(
                  eq(colaboradores.empresaId, input.empresaId),
                  eq(colaboradores.id, porMatricula.get(pessoa.matricula)!)
                )
              );
        }
        const [r] = await tx.insert(equipeLotes).values({
          empresaId: input.empresaId,
          usuarioId: ctx.usuario.id,
          chave,
          pessoas: ids,
        });
        await tx.insert(logAuditoria).values({
          empresaId: input.empresaId,
          usuarioId: ctx.usuario.id,
          acao: "equipe.importar_lote",
          entidade: "equipe_lotes",
          entidadeId: r.insertId,
          detalhes: JSON.stringify({
            total: ids.length,
            enviarConvites: input.enviarConvites,
            hashArquivo: sha(input.csv),
          }),
        });
        return { id: r.insertId, pessoas: ids, idempotente: false };
      });
      const convites: {
        colaboradorId: number;
        status: string;
        emailEnviado: boolean;
      }[] = [];
      // Efeitos externos somente após confirmação e commit. Retry usa a reserva durável já existente.
      if (input.enviarConvites) {
        for (const colaboradorId of lote.pessoas) {
          try {
            const r = await enviarConviteColaboradorIdempotente({
              empresaId: input.empresaId,
              colaboradorId,
              usuarioId: ctx.usuario.id,
            });
            convites.push({
              colaboradorId,
              status: r.statusWhatsapp,
              emailEnviado: r.enviadoPorEmail,
            });
          } catch {
            convites.push({
              colaboradorId,
              status: "revisao_necessaria",
              emailEnviado: false,
            });
          }
        }
      }
      return { ...lote, convites };
    }),
});

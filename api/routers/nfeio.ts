import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createRouter, protectedProcedure } from "../middleware";
import {
  executarConsultaNfeIo,
  type DependenciasConsultaNfeIo,
} from "../modules/fiscal/nfeio/service";

/** Mutation intencional: GET externo pode consumir crédito e exige confirmação. */
export function criarNfeIoRouter(deps?: DependenciasConsultaNfeIo) {
  return createRouter({
    consultar: protectedProcedure
      .input(
        z
          .object({
            empresaId: z.number().int().positive(),
            notaFiscalId: z.number().int().positive(),
            solicitacaoId: z.string().uuid(),
            confirmarConsulta: z.literal(true),
          })
          .strict()
      )
      .mutation(async ({ ctx, input }) => {
        try {
          return await executarConsultaNfeIo(ctx, input, deps);
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message:
              "Consulta não concluída; preserve seu identificador e confira o registro operacional.",
          });
        }
      }),
  });
}
export const nfeIoRouter = criarNfeIoRouter();

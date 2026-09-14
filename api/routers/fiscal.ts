import { createRouter, protectedProcedure } from "../middleware";
import {
  configurarFiscalInput,
  empresaFiscalInput,
} from "../../contracts/fiscal";
import { assertAdminDaEmpresa, assertEmpresaAcesso } from "./_shared";
import {
  historicoConfiguracaoFiscal,
  lerConfiguracaoFiscal,
  salvarConfiguracaoFiscal,
} from "../modules/fiscal/verificacao/configuracao";

export function criarFiscalRouter(
  deps = {
    autorizarLeitura: assertEmpresaAcesso,
    autorizarAlteracao: assertAdminDaEmpresa,
    ler: lerConfiguracaoFiscal,
    salvar: salvarConfiguracaoFiscal,
    historico: historicoConfiguracaoFiscal,
  }
) {
  return createRouter({
    configuracao: protectedProcedure
      .input(empresaFiscalInput)
      .query(async ({ ctx, input }) => {
        const empresa = await deps.autorizarLeitura(ctx, input.empresaId);
        const configuracao = await deps.ler(input.empresaId);
        const podeAlterar =
          ctx.usuario.perfil === "admin" ||
          empresa.usuarioId === ctx.usuario.id;
        return {
          ...configuracao,
          podeAlterar,
          historico: podeAlterar ? await deps.historico(input.empresaId) : [],
        };
      }),
    configurar: protectedProcedure
      .input(configurarFiscalInput)
      .mutation(async ({ ctx, input }) => {
        await deps.autorizarAlteracao(
          ctx,
          input.empresaId,
          "Só o administrador da empresa pode configurar a verificação fiscal."
        );
        return deps.salvar(input, ctx.usuario.id);
      }),
  });
}
export const fiscalRouter = criarFiscalRouter();

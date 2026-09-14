import { cnaesSecundarios, empresas } from "@db/schema";
import type { EmpresaInput } from "@contracts/empresas";
import type { getDb } from "../../queries/connection";
import { registrarLog } from "../../routers/_shared";

type EscritaEmpresa = Pick<ReturnType<typeof getDb>, "insert">;

/**
 * Cria empresa, atividades e auditoria usando a transação do chamador.
 * O cadastro inicial pode incluir a conta nessa mesma transação; o módulo
 * Empresas não conhece senhas, sessões nem a camada HTTP.
 */
export async function criarEmpresa(
  db: EscritaEmpresa,
  usuarioId: number,
  input: EmpresaInput,
): Promise<number> {
  const result = await db.insert(empresas).values({
    usuarioId,
    razaoSocial: input.razaoSocial,
    cnpj: input.cnpj,
    cnaePrincipal: input.cnaePrincipal,
    regimeTributario: input.regimeTributario,
    uf: input.uf,
  });
  const id = Number(result[0].insertId);

  if (input.cnaesSecundarios.length > 0) {
    await db.insert(cnaesSecundarios).values(
      input.cnaesSecundarios.map((cnae) => ({ empresaId: id, cnae })),
    );
  }

  await registrarLog(db, {
    usuarioId,
    empresaId: id,
    acao: "empresa.create",
    entidade: "empresa",
    entidadeId: id,
    detalhes: `CNAE ${input.cnaePrincipal}, regime ${input.regimeTributario}, UF ${input.uf}, LGPD ${input.aceiteLgpd ? "aceito" : "n/a"}, poderes ${input.declaracaoPoderes ? "declarados" : "n/a"}`,
  });

  return id;
}

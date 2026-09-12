import { Hono } from "hono";

export type SituacaoColaboradorWhatsapp = "ativo" | "suspenso";

export type ColaboradorResolvidoWhatsapp = {
  colaboradorId: number;
  empresaId: number;
  empresaNome: string;
  nome: string;
  situacao: SituacaoColaboradorWhatsapp;
  politicaId: number | null;
  tags: string[];
};

/**
 * A API de serviço aceita E.164 canônico para eliminar busca aproximada entre
 * países/DDDs. O banco armazena somente dígitos; o sinal `+` não é persistido.
 */
export function normalizarTelefoneE164(telefone: string | undefined): string | null {
  if (!telefone || !/^\+[1-9]\d{7,14}$/.test(telefone)) return null;
  return telefone.slice(1);
}

export type ResolverColaboradoresWhatsapp = (
  telefoneNormalizado: string,
) => Promise<ColaboradorResolvidoWhatsapp[]>;

/**
 * Rotas de identidade para a integração. A autenticação de serviço é aplicada
 * pelo `boot.ts` em todo `/api/v1/*`; separar o router permite testá-lo sem
 * banco, token ou rede externa.
 */
export function criarRouterIdentificacaoWhatsapp(
  resolver: ResolverColaboradoresWhatsapp,
) {
  const app = new Hono();

  app.get("/colaboradores", async c => {
    const telefone = normalizarTelefoneE164(c.req.query("telefone"));
    if (!telefone) return c.json({ error: "Telefone inválido." }, 400);

    try {
      const colaboradores = await resolver(telefone);
      // Lista vazia é a única resposta para número não cadastrado: não há
      // diferença observável que revele empresa, pessoa ou estado interno.
      return c.json({ colaboradores });
    } catch (erro) {
      // Não registrar telefone/payload em log: ambos são dados pessoais.
      console.error("[whatsapp] Falha ao resolver colaborador da integração:", erro);
      return c.json({ error: "Serviço temporariamente indisponível." }, 503);
    }
  });

  return app;
}

import { eq } from "drizzle-orm";
import { getDb } from "../../../queries/connection";
import {
  colaboradores,
  declaracoesPerfil,
  empresas,
  sessoesConversa,
  veiculos,
} from "@db/schema";
import type { MensagemRecebida, WhatsappProvider } from "../whatsapp/types";
import { registrarLog } from "../../../routers/_shared";
import {
  MSG_TELEFONE_DESCONHECIDO,
  proximoPasso,
  type AcaoMaquina,
  type ContextoConversa,
  type EstadoConversa,
} from "./maquina";

export * from "./maquina";

type Db = ReturnType<typeof getDb>;

/** Normaliza telefone para comparação: só dígitos. */
export function normalizarTelefone(t: string): string {
  return t.replace(/\D/g, "");
}

/**
 * Encontra o colaborador dono do telefone. Comparação tolerante: o admin pode
 * ter cadastrado com/sem DDI 55 — comparamos pelos últimos 10 dígitos quando
 * o número tem DDI.
 */
async function encontrarColaborador(db: Db, telefone: string) {
  const alvo = normalizarTelefone(telefone);
  if (!alvo) return null;
  // Nota: MySQL não tem "ends with digits" portável — filtramos em memória.
  // Volume de colaboradores por instalação é baixo (dezenas/centenas).
  const rows = await db.select().from(colaboradores);
  return (
    rows.find((r) => {
      const tel = normalizarTelefone(r.telefone ?? "");
      if (!tel) return false;
      if (tel === alvo) return true;
      return tel.slice(-10) === alvo.slice(-10) && alvo.length >= 10;
    }) ?? null
  );
}

async function obterOuCriarSessao(db: Db, telefone: string) {
  const tel = normalizarTelefone(telefone);
  const existente = await db
    .select()
    .from(sessoesConversa)
    .where(eq(sessoesConversa.telefone, tel))
    .limit(1);
  if (existente[0]) return existente[0];
  const result = await db.insert(sessoesConversa).values({
    telefone: tel,
    estado: "inicio",
    contexto: {},
  });
  const id = Number(result[0].insertId);
  const criada = await db
    .select()
    .from(sessoesConversa)
    .where(eq(sessoesConversa.id, id))
    .limit(1);
  return criada[0];
}

async function executarAcoes(
  db: Db,
  acoes: AcaoMaquina[],
  colaboradorId: number,
  empresaId: number,
  contexto: ContextoConversa,
) {
  for (const acao of acoes) {
    switch (acao.tipo) {
      case "salvar_declaracoes": {
        const categorias = (
          [
            ["combustivel", contexto.combustivel],
            ["hospedagem", contexto.viagem],
            ["alimentacao", contexto.refeicao],
          ] as const
        )
          .filter(([, declarou]) => declarou === true)
          .map(([categoria]) => categoria);
        for (const categoria of categorias) {
          // Idempotente: unique (colaboradorId, categoria) no schema.
          await db
            .insert(declaracoesPerfil)
            .values({ colaboradorId, categoria })
            .onDuplicateKeyUpdate({ set: { colaboradorId } });
        }
        break;
      }
      case "criar_veiculo": {
        if (!contexto.veiculoPlaca || !contexto.veiculoConsumo) break;
        await db.insert(veiculos).values({
          empresaId,
          placa: contexto.veiculoPlaca,
          descricao: contexto.veiculoDescricao ?? null,
          kmPorLitroDeclarado: contexto.veiculoConsumo,
          tarifaReembolsoKm: 0,
        });
        break;
      }
      case "marcar_confirmado":
        await db
          .update(colaboradores)
          .set({ statusAtivacao: "confirmado" })
          .where(eq(colaboradores.id, colaboradorId));
        break;
      case "marcar_divergencia":
        await db
          .update(colaboradores)
          .set({ statusAtivacao: "divergencia" })
          .where(eq(colaboradores.id, colaboradorId));
        await registrarLog(db, {
          empresaId,
          acao: "colaborador.divergencia",
          entidade: "colaboradores",
          entidadeId: colaboradorId,
          detalhes: acao.detalhe,
        });
        break;
    }
  }
}

/**
 * Ponto de entrada do agente (webhook → aqui). Nunca lança exceção para o
 * caller: erros são logados; o webhook sempre responde 200 para o provider
 * não reenviar o evento em loop.
 */
export async function processarMensagemRecebida(
  msg: MensagemRecebida,
  provider: WhatsappProvider | null,
): Promise<void> {
  const db = getDb();
  try {
    const colaborador = await encontrarColaborador(db, msg.telefone);
    const sessao = await obterOuCriarSessao(db, msg.telefone);

    if (!colaborador) {
      // Portão único (D-005): sem cadastro prévio pelo admin, não há conversa.
      await db
        .update(sessoesConversa)
        .set({ ultimaInteracaoAt: new Date() })
        .where(eq(sessoesConversa.id, sessao.id));
      if (sessao.estado !== "pronto" && provider) {
        await provider.sendText(msg.telefone, MSG_TELEFONE_DESCONHECIDO);
      }
      return;
    }

    // Vincula a sessão ao colaborador reconhecido.
    if (sessao.colaboradorId !== colaborador.id) {
      await db
        .update(sessoesConversa)
        .set({ colaboradorId: colaborador.id })
        .where(eq(sessoesConversa.id, sessao.id));
    }

    // Quem já concluiu o onboarding e manda mensagem nova recomeça em "inicio"
    // apenas se ainda não confirmou dados — senão, segue no estado atual.
    const estadoAtual =
      colaborador.statusAtivacao === "confirmado"
        ? ("pronto" as EstadoConversa)
        : ((sessao.estado || "inicio") as EstadoConversa);

    const empresaRows = await db
      .select()
      .from(empresas)
      .where(eq(empresas.id, colaborador.empresaId))
      .limit(1);
    const empresaNome = empresaRows[0]?.razaoSocial ?? "sua empresa";

    const contexto = (sessao.contexto ?? {}) as ContextoConversa;

    const saida = proximoPasso({
      estado: estadoAtual,
      contexto,
      colaborador: {
        nome: colaborador.nome,
        email: colaborador.email,
        telefone: colaborador.telefone,
        matricula: colaborador.matricula,
      },
      empresaNome,
      texto: msg.texto,
    });

    await db
      .update(sessoesConversa)
      .set({
        estado: saida.estado,
        contexto: saida.contexto,
        ultimaInteracaoAt: new Date(),
      })
      .where(eq(sessoesConversa.id, sessao.id));

    await executarAcoes(
      db,
      saida.acoes,
      colaborador.id,
      colaborador.empresaId,
      saida.contexto,
    );

    if (provider) {
      for (const resposta of saida.respostas) {
        await provider.sendText(msg.telefone, resposta);
      }
    } else {
      for (const resposta of saida.respostas) {
        console.log(`[agente] (sem provider) → ${msg.telefone}: ${resposta}`);
      }
    }
  } catch (err) {
    console.error("[agente] Falha ao processar mensagem:", err);
  }
}

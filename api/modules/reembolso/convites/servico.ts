import {
  dominioAdministrador,
  exigirDominioConvite,
} from "../../../lib/dominioConvite";
import { and, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  colaboradores,
  convites,
  empresas,
  whatsappOutbox,
  whatsappWebhookEvents,
} from "../../../../db/schema";
import { getDb } from "../../../queries/connection";
import { gerarTokenConvite, linkAceite } from "../../../lib/conviteUtils";
import { CONVITE_TTL_MS } from "../../../lib/conviteAcesso";
import { gerarLinkConviteWhatsapp } from "../../../lib/conviteWhatsapp";
import { enviarConviteColaboradorEmail } from "../../../mail/mailer";
import { saldoChamadasPoc } from "../../../lib/pocConsultas";
import { enviarBoasVindasWhatsapp360dialog } from "../whatsapp/dialog360Invite";
import { criarChaveIdempotenciaWhatsapp } from "../whatsapp/fila";

export type StatusWhatsappConvite =
  | "pendente"
  | "aceito"
  | "entregue"
  | "falhou"
  | "incerto"
  | "nao_configurado"
  | "limite_atingido";
type PayloadConvite = {
  conviteId: number;
  enviadoPorEmail: boolean;
  statusWhatsapp: StatusWhatsappConvite;
};
type Outbox = typeof whatsappOutbox.$inferSelect;
type Convite = typeof convites.$inferSelect;
type Pessoa = typeof colaboradores.$inferSelect;
type Empresa = typeof empresas.$inferSelect;
type ResultadoWhatsapp = {
  enviado: boolean;
  messageId: string | null;
  status:
    "aceito" | "falhou" | "incerto" | "nao_configurado" | "limite_atingido";
};
type Dependencias = {
  db?: ReturnType<typeof getDb>;
  email?: typeof enviarConviteColaboradorEmail;
  whatsapp?: (opts: {
    telefone: string | null;
    nome: string;
  }) => Promise<ResultadoWhatsapp>;
  agora?: () => Date;
  saldo?: () => number;
};
export type ResultadoConvite = {
  conviteId: number;
  linkAceite: string;
  linkWhatsapp: string | null;
  enviadoPorWhatsapp: boolean;
  messageIdWhatsapp: string | null;
  enviadoPorEmail: boolean;
  email: string;
  statusWhatsapp: StatusWhatsappConvite;
};

function lerPayload(raw: unknown): PayloadConvite {
  const p = raw as Partial<PayloadConvite> | null;
  const estados: StatusWhatsappConvite[] = [
    "pendente",
    "aceito",
    "entregue",
    "falhou",
    "incerto",
    "nao_configurado",
    "limite_atingido",
  ];
  if (
    !p ||
    !Number.isSafeInteger(p.conviteId) ||
    Number(p.conviteId) <= 0 ||
    typeof p.enviadoPorEmail !== "boolean" ||
    !estados.includes(p.statusWhatsapp as StatusWhatsappConvite)
  ) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Reserva de convite precisa de revisão operacional.",
    });
  }
  return p as PayloadConvite;
}

/** Não confunde aceitação HTTP/sent com comprovação de entrega ao destinatário. */
export function reciboConfirmaEntrega(
  evento: {
    mensagemId: string | null;
    telefone: string | null;
    canalTelefone: string | null;
    statusEntrega: string | null;
  },
  messageId: string | null,
  telefone: string
): boolean {
  return Boolean(
    messageId &&
    evento.mensagemId === messageId &&
    evento.telefone === telefone &&
    evento.canalTelefone === "552196483003" &&
    ["delivered", "read"].includes(evento.statusEntrega ?? "")
  );
}

function apresentar(
  row: Outbox,
  convite: Convite,
  pessoa: Pessoa,
  empresa: Empresa
): ResultadoConvite {
  const payload = lerPayload(row.payload);
  const link = linkAceite(convite.token);
  const aceito =
    payload.statusWhatsapp === "aceito" ||
    payload.statusWhatsapp === "entregue";
  return {
    conviteId: convite.id,
    linkAceite: link,
    linkWhatsapp: ["falhou", "nao_configurado"].includes(payload.statusWhatsapp)
      ? gerarLinkConviteWhatsapp({
          telefone: row.telefone,
          nome: pessoa.nome,
          empresa: empresa.razaoSocial,
          link,
        })
      : null,
    enviadoPorWhatsapp: aceito,
    messageIdWhatsapp: row.providerMensagemId,
    enviadoPorEmail: payload.enviadoPorEmail,
    email: convite.email,
    statusWhatsapp: payload.statusWhatsapp,
  };
}

/** Autorização administrativa é exigida no router ANTES desta entrada interna. */
export async function enviarConviteColaboradorIdempotente(
  input: { empresaId: number; colaboradorId: number; usuarioId: number },
  deps: Dependencias = {}
): Promise<ResultadoConvite> {
  const db = deps.db ?? getDb();
  const agora = deps.agora ?? (() => new Date());
  const chave = criarChaveIdempotenciaWhatsapp({
    provider: "dialog360",
    direcao: "saida",
    tipoEvento: "convite",
    identificadorExterno: `primeiro:${input.empresaId}:${input.colaboradorId}`,
  });
  const reserva = await db.transaction(async tx => {
    const [pessoa] = await tx
      .select()
      .from(colaboradores)
      .where(
        and(
          eq(colaboradores.id, input.colaboradorId),
          eq(colaboradores.empresaId, input.empresaId)
        )
      )
      .for("update");
    if (!pessoa || pessoa.statusVinculo !== "ativo")
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Colaborador sem vínculo ativo.",
      });
    if (!pessoa.email)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Cadastre o e-mail do colaborador antes de enviar o convite.",
      });
    const [empresa] = await tx
      .select()
      .from(empresas)
      .where(eq(empresas.id, input.empresaId))
      .limit(1);
    if (!empresa)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Empresa indisponível.",
      });
    exigirDominioConvite(
      pessoa.email,
      await dominioAdministrador(tx, empresa.usuarioId)
    );
    // O lock do colaborador acima serializa a criação da reserva. A outbox é
    // atualizada depois do commit durante os envios; bloqueá-la aqui faz uma
    // segunda requisição disputar com essa atualização e pode causar
    // ER_CHECKREAD no MariaDB, mesmo sem nova emissão.
    let [row] = await tx
      .select()
      .from(whatsappOutbox)
      .where(
        and(
          eq(whatsappOutbox.provider, "dialog360"),
          eq(whatsappOutbox.chaveIdempotencia, chave)
        )
      )
      .limit(1);
    if (row) {
      if (
        row.empresaId !== input.empresaId ||
        row.colaboradorId !== input.colaboradorId ||
        row.tipoMensagem !== "convite"
      )
        throw new TRPCError({
          code: "CONFLICT",
          message: "Reserva de convite incompatível.",
        });
      const payload = lerPayload(row.payload);
      const [convite] = await tx
        .select()
        .from(convites)
        .where(eq(convites.id, payload.conviteId))
        .for("update");
      if (
        !convite ||
        convite.status === "revogado" ||
        convite.expiresAt.getTime() <= agora().getTime() ||
        convite.email.toLowerCase() !== pessoa.email.toLowerCase()
      )
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "Convite expirado, revogado ou cadastro alterado; é necessária revisão explícita.",
        });
      // Novo clique explícito pode retomar somente bloqueio comprovado ANTES da rede.
      if (
        payload.statusWhatsapp === "limite_atingido" &&
        !row.providerMensagemId &&
        (deps.saldo ?? saldoChamadasPoc)() > 0
      ) {
        if (row.telefone !== (pessoa.telefone?.replace(/\D/g, "") ?? ""))
          throw new TRPCError({
            code: "CONFLICT",
            message: "Telefone alterado; confira o convite antes de reenviar.",
          });
        const atualizado = {
          ...row,
          status: "processando",
          tentativas: row.tentativas + 1,
          processandoEm: agora(),
          payload: { ...payload, statusWhatsapp: "pendente" as const },
        };
        await tx
          .update(whatsappOutbox)
          .set({
            status: atualizado.status,
            tentativas: atualizado.tentativas,
            processandoEm: atualizado.processandoEm,
            payload: atualizado.payload,
          })
          .where(eq(whatsappOutbox.id, row.id));
        return {
          novo: true as const,
          enviarEmail: false,
          row: atualizado,
          convite,
          pessoa,
          empresa,
        };
      }
      if (
        payload.statusWhatsapp === "pendente" &&
        agora().getTime() - (row.processandoEm ?? row.createdAt).getTime() >
          120_000
      ) {
        payload.statusWhatsapp = "incerto";
        await tx
          .update(whatsappOutbox)
          .set({ status: "incerto", payload })
          .where(eq(whatsappOutbox.id, row.id));
        row = { ...row, status: "incerto", payload };
      }
      if (row.providerMensagemId && payload.statusWhatsapp !== "entregue") {
        const eventos = await tx
          .select({
            mensagemId: whatsappWebhookEvents.mensagemId,
            telefone: whatsappWebhookEvents.telefone,
            canalTelefone: whatsappWebhookEvents.canalTelefone,
            statusEntrega: whatsappWebhookEvents.statusEntrega,
          })
          .from(whatsappWebhookEvents)
          .where(
            and(
              eq(whatsappWebhookEvents.tipoEvento, "status"),
              eq(whatsappWebhookEvents.mensagemId, row.providerMensagemId),
              eq(whatsappWebhookEvents.telefone, row.telefone),
              eq(whatsappWebhookEvents.canalTelefone, "552196483003"),
              inArray(whatsappWebhookEvents.statusEntrega, [
                "delivered",
                "read",
              ])
            )
          )
          .limit(1);
        if (
          eventos.some(e =>
            reciboConfirmaEntrega(e, row.providerMensagemId, row.telefone)
          )
        ) {
          payload.statusWhatsapp = "entregue";
          await tx
            .update(whatsappOutbox)
            .set({ payload })
            .where(eq(whatsappOutbox.id, row.id));
          row = { ...row, payload };
        }
      }
      return { novo: false as const, row, convite, pessoa, empresa };
    }
    if (pessoa.usuarioId)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Este colaborador já ativou o acesso dele.",
      });
    const token = gerarTokenConvite();
    const [inserido] = await tx
      .insert(convites)
      .values({
        email: pessoa.email,
        perfil: "cliente",
        token,
        createdById: input.usuarioId,
        expiresAt: new Date(agora().getTime() + CONVITE_TTL_MS),
      });
    const [convite] = await tx
      .select()
      .from(convites)
      .where(eq(convites.id, Number(inserido.insertId)))
      .limit(1);
    const payload: PayloadConvite = {
      conviteId: convite.id,
      enviadoPorEmail: false,
      statusWhatsapp: "pendente",
    };
    const [out] = await tx
      .insert(whatsappOutbox)
      .values({
        provider: "dialog360",
        chaveIdempotencia: chave,
        empresaId: input.empresaId,
        colaboradorId: input.colaboradorId,
        tipoMensagem: "convite",
        telefone: pessoa.telefone?.replace(/\D/g, "") ?? "",
        payload,
        status: "processando",
        tentativas: 1,
        processandoEm: agora(),
      });
    [row] = await tx
      .select()
      .from(whatsappOutbox)
      .where(eq(whatsappOutbox.id, Number(out.insertId)))
      .limit(1);
    return {
      novo: true as const,
      enviarEmail: true,
      row,
      convite,
      pessoa,
      empresa,
    };
  });
  if (!reserva.novo)
    return apresentar(
      reserva.row,
      reserva.convite,
      reserva.pessoa,
      reserva.empresa
    );

  // A reserva já está committed. Nenhuma conexão/lock permanece aberto na rede.
  const payload = lerPayload(reserva.row.payload);
  try {
    if (reserva.enviarEmail) {
      const email = await (deps.email ?? enviarConviteColaboradorEmail)({
        para: reserva.convite.email,
        nome: reserva.pessoa.nome,
        empresa: reserva.empresa.razaoSocial,
        link: linkAceite(reserva.convite.token),
      });
      payload.enviadoPorEmail = email.enviado;
    }
  } catch {
    /* Sem retry automático: SMTP pode ter aceitado antes do timeout. */
  }
  try {
    await db
      .update(whatsappOutbox)
      .set({ payload })
      .where(
        and(
          eq(whatsappOutbox.id, reserva.row.id),
          eq(whatsappOutbox.empresaId, input.empresaId)
        )
      );
  } catch {
    return apresentar(
      { ...reserva.row, payload: { ...payload, statusWhatsapp: "incerto" } },
      reserva.convite,
      reserva.pessoa,
      reserva.empresa
    );
  }

  let whatsapp: ResultadoWhatsapp;
  try {
    whatsapp = await (deps.whatsapp ?? enviarBoasVindasWhatsapp360dialog)({
      telefone: reserva.pessoa.telefone,
      nome: reserva.pessoa.nome,
    });
  } catch {
    whatsapp = { enviado: false, messageId: null, status: "incerto" };
  }
  payload.statusWhatsapp =
    whatsapp.status === "aceito" && !whatsapp.messageId
      ? "incerto"
      : whatsapp.status;
  const resultado = {
    ...reserva.row,
    providerMensagemId: whatsapp.messageId,
    payload,
  };
  try {
    await db
      .update(whatsappOutbox)
      .set({
        payload,
        providerMensagemId: whatsapp.messageId,
        status:
          payload.statusWhatsapp === "aceito"
            ? "enviado"
            : payload.statusWhatsapp,
        enviadoEm: payload.statusWhatsapp === "aceito" ? agora() : null,
      })
      .where(
        and(
          eq(whatsappOutbox.id, reserva.row.id),
          eq(whatsappOutbox.empresaId, input.empresaId)
        )
      );
  } catch {
    resultado.payload = { ...payload, statusWhatsapp: "incerto" };
  }
  return apresentar(
    resultado,
    reserva.convite,
    reserva.pessoa,
    reserva.empresa
  );
}

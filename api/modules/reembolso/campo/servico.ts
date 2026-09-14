import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { colaboradores, veiculos, politicasReembolso } from "../../../../db/schema";
import { pocCampo, pocConfiguracao } from "../../../../db/pocSchema";
import { getDb } from "../../../queries/connection";
import { acrescentarPonto, adicionarPonto, novoEstadoCampo, pontoSchema, type EstadoCampo } from "./dominio";

export type IdentidadeCampo = { empresaId: number; colaboradorId: number };
export const eventoCampoSchema = z.object({
  jornadaId: z.string().uuid(), veiculo: z.string().min(1).max(10),
  consumoKmLitro: z.number().finite().positive().max(100).optional(),
  ponto: pontoSchema,
});

type Db = ReturnType<typeof getDb>;
export type TransacaoCampo = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Tx = TransacaoCampo;

/** Lock da pessoa cobre inclusive criação inicial; nunca há upsert que apaga estado. */
export async function alterarCampo<T>(identidade: IdentidadeCampo, usuarioId: number | null, acao: string, alterar: (estado: EstadoCampo, tx: Tx) => Promise<T> | T): Promise<T> {
  return getDb().transaction(async tx => {
    const [pessoa] = await tx.select().from(colaboradores).where(and(eq(colaboradores.id, identidade.colaboradorId), eq(colaboradores.empresaId, identidade.empresaId))).for("update");
    if (!pessoa || pessoa.statusVinculo !== "ativo") throw new Error("Vínculo indisponível.");
    const [row] = await tx.select().from(pocCampo).where(and(eq(pocCampo.colaboradorId, pessoa.id), eq(pocCampo.empresaId, pessoa.empresaId))).for("update");
    const estado = row?.estado ?? novoEstadoCampo();
    const estadoAnterior = JSON.stringify(estado);
    const resultado = await alterar(estado, tx);
    if (JSON.stringify(estado) === estadoAnterior) return resultado;
    estado.auditoria.push({ usuarioId, origem: usuarioId === null ? "canal" : "backoffice", em: new Date().toISOString(), acao });
    if (Buffer.byteLength(JSON.stringify(estado), "utf8") > 4_000_000) throw new Error("Limite operacional do piloto atingido; arquivamento necessário.");
    if (row) await tx.update(pocCampo).set({ estado }).where(and(eq(pocCampo.colaboradorId, pessoa.id), eq(pocCampo.empresaId, pessoa.empresaId)));
    else await tx.insert(pocCampo).values({ colaboradorId: pessoa.id, empresaId: pessoa.empresaId, estado });
    return resultado;
  });
}

/** Entrada de serviço: somente identidade resolvida pelo servidor, jamais payload do provedor. */
export async function registrarEventoCampo(identidade: IdentidadeCampo, dados: z.infer<typeof eventoCampoSchema>, usuarioId: number | null = null) {
  const input = eventoCampoSchema.parse(dados);
  return alterarCampo(identidade, usuarioId, `evento:${input.ponto.id}`, (estado, tx) => adicionarEventoAoEstado(estado, tx, identidade, input));
}

async function adicionarEventoAoEstado(estado: EstadoCampo, tx: Tx, identidade: IdentidadeCampo, input: z.infer<typeof eventoCampoSchema>) {
    const [config] = await tx.select().from(pocConfiguracao).where(eq(pocConfiguracao.empresaId, identidade.empresaId));
    if (!config?.configuracao.retencaoLocalizacaoDias) throw new Error("Administrador precisa validar política e retenção de localização antes de registrar pontos.");
    const [politica] = await tx.select().from(politicasReembolso).where(and(eq(politicasReembolso.id, config.configuracao.politicaId), eq(politicasReembolso.empresaId, identidade.empresaId)));
    if (!politica || politica.status !== "ativa" || politica.versao !== config.configuracao.politicaVersao) throw new Error("Política de campo precisa ser revalidada.");
    let jornada = estado.jornadas.find(j => j.id === input.jornadaId);
    const outra = estado.jornadas.find(j => j.id !== input.jornadaId && j.pontos.some(p => p.id === input.ponto.id));
    if (outra) throw new Error("Evento já pertence a outra jornada.");
    if (!jornada) {
      if (estado.jornadas.some(j => j.pontos.at(-1)?.tipo !== "check_out")) throw new Error("Encerre a jornada aberta antes de iniciar outra.");
      const [veiculo] = await tx.select().from(veiculos).where(and(eq(veiculos.empresaId, identidade.empresaId), eq(veiculos.placa, input.veiculo))).limit(1);
      if (!veiculo) throw new Error("Veículo não cadastrado nesta empresa.");
      jornada = { id: input.jornadaId, veiculo: veiculo.placa, consumoKmLitro: veiculo.kmPorLitroDeclarado > 0 ? veiculo.kmPorLitroDeclarado : null, pontos: [], calculo: { estado: "aguardando_calculo", metros: null, calculadoEm: null } };
      estado.jornadas.push(jornada);
    }
    if (jornada.veiculo !== input.veiculo) throw new Error("Veículo difere da jornada original.");
    const nova = adicionarPonto(jornada, input.ponto, new Date().toISOString());
    estado.jornadas[estado.jornadas.indexOf(jornada)] = nova;
    return nova;
}

/** Vinculação posterior explícita: a presença original permanece imutável. */
export async function vincularPresencaCampo(identidade: IdentidadeCampo, presencaId: string, veiculo: string, usuarioId: number) {
  return alterarCampo(identidade, usuarioId, `presenca.vincular:${presencaId}`, async (estado, tx) => {
    const presenca = estado.presencas?.find(p => p.id === presencaId);
    if (!presenca || presenca.pontos.at(-1)?.tipo !== "check_out") throw new Error("Conclua o check-in e check-out antes de vincular à quilometragem.");
    if (presenca.jornadaId) {
      const original = estado.jornadas.find(j => j.id === presenca.jornadaId);
      if (!original || original.veiculo !== veiculo) throw new Error("Presença já vinculada a outro veículo.");
      return original;
    }
    const jornadaId = randomUUID();
    for (const ponto of presenca.pontos) await adicionarEventoAoEstado(estado, tx, identidade, { jornadaId, veiculo, ponto });
    presenca.jornadaId = jornadaId;
    return estado.jornadas.find(j => j.id === jornadaId)!;
  });
}

export async function interpretarMensagemCampo(identidade: IdentidadeCampo, mensagem: { id: string; type: string; text?: string; location?: { latitude: number; longitude: number; name?: string; address?: string; accuracy?: number }; timestamp: string | number }): Promise<{ textoResposta: string } | null> {
  const comando = /^(check-?in|checkpoint|check-?out)(?:\s+([a-z0-9-]{7,8}))?$/i.exec(mensagem.text?.trim() ?? "");
  if (!comando && mensagem.type !== "location") return null;
  return alterarCampo(identidade, null, `conversa:${mensagem.id}`, estado => {
    estado.conversa ??= { pendente: null, respostas: [] };
    const timestampRecebido = typeof mensagem.timestamp === "number" || /^\d+$/.test(mensagem.timestamp) ? new Date(Number(mensagem.timestamp) * 1000) : new Date(mensagem.timestamp);
    if (Number.isFinite(timestampRecebido.getTime()) && timestampRecebido.getTime() <= Date.now() && timestampRecebido.getTime() > Date.parse(estado.conversa.ultimaMensagemEm ?? "1970-01-01")) estado.conversa.ultimaMensagemEm = timestampRecebido.toISOString();
    const hash = createHash("sha256").update(JSON.stringify({ type: mensagem.type, text: mensagem.text ?? null, location: mensagem.location ?? null, timestamp: String(mensagem.timestamp) })).digest("hex");
    const replay = estado.conversa.respostas.find(r => r.id === mensagem.id);
    if (replay) {
      if (replay.hash !== hash) throw new Error("Identificador de mensagem já usado com outro conteúdo.");
      return { textoResposta: replay.texto };
    }
    if (!Number.isFinite(timestampRecebido.getTime()) || timestampRecebido.getTime() > Date.now() + 300_000) throw new Error("Horário de mensagem inválido.");
    let textoResposta: string;
    if (comando) {
      const tipo = ({ checkin: "check_in", checkpoint: "checkpoint", checkout: "check_out" } as const)[comando[1].toLowerCase().replace("-", "") as "checkin" | "checkpoint" | "checkout"];
      const aberta = estado.presencas?.find(p => p.pontos.at(-1)?.tipo !== "check_out");
      if (tipo === "check_in" && aberta) textoResposta = "Você já tem um check-in aberto. Envie checkpoint ou check-out.";
      else if (tipo !== "check_in" && !aberta) textoResposta = "Envie check-in e sua localização antes de registrar checkpoint ou check-out.";
      else {
        estado.conversa.pendente = { fluxo: "presenca", tipo, presencaId: aberta?.id ?? randomUUID(), comandoId: mensagem.id, comandoEm: timestampRecebido.toISOString(), expiraEm: new Date(Date.now() + 15 * 60_000).toISOString() };
        textoResposta = "Envie sua localização para confirmar.";
      }
    } else {
      const pendente = estado.conversa.pendente;
      if (!pendente || Date.parse(pendente.expiraEm) < Date.now()) {
        // A localização pode iniciar ou encerrar a presença sem exigir um
        // comando textual. Comando explícito continua sendo aceito acima e
        // preserva o fluxo de checkpoint.
        estado.conversa.pendente = null;
        const aberta = estado.presencas?.find(p => p.pontos.at(-1)?.tipo !== "check_out");
        const tipo = aberta ? "check_out" : "check_in";
        const presencaId = aberta?.id ?? randomUUID();
        const ponto = pontoSchema.parse({ id: mensagem.id, tipo, latitude: mensagem.location?.latitude, longitude: mensagem.location?.longitude, nomeLocal: mensagem.location?.name, endereco: mensagem.location?.address, precisaoMetros: mensagem.location?.accuracy, ocorridoEm: timestampRecebido.toISOString() });
        estado.presencas ??= [];
        const presenca = aberta ?? { id: presencaId, pontos: [] };
        if (!aberta) estado.presencas.push(presenca);
        const pontos = acrescentarPonto(presenca.pontos, ponto, new Date().toISOString());
        const novo = pontos.at(-1)!;
        presenca.pontos.push({ ...novo, comandoId: mensagem.id, comandoEm: timestampRecebido.toISOString() });
        const referencia = mensagem.location?.address || mensagem.location?.name ? " Endereço da localização guardado para a quilometragem." : "";
        textoResposta = tipo === "check_in"
          ? `Check-in registrado. Envie outra localização quando encerrar.${referencia}`
          : `Check-out registrado!${referencia}`;
      } else if (pendente.fluxo !== "presenca") {
        // Comandos antigos não são reinterpretados após a separação dos fluxos.
        estado.conversa.pendente = null;
        textoResposta = "Envie novamente check-in ou check-out e depois sua localização.";
      } else {
        if (timestampRecebido.getTime() < Date.parse(pendente.comandoEm)) throw new Error("Localização anterior ao comando; envie sua localização atual.");
        const ponto = pontoSchema.parse({ id: mensagem.id, tipo: pendente.tipo, latitude: mensagem.location?.latitude, longitude: mensagem.location?.longitude, nomeLocal: mensagem.location?.name, endereco: mensagem.location?.address, precisaoMetros: mensagem.location?.accuracy, ocorridoEm: timestampRecebido.toISOString() });
        estado.presencas ??= [];
        let presenca = estado.presencas.find(p => p.id === pendente.presencaId);
        if (!presenca) {
          if (pendente.tipo !== "check_in" || estado.presencas.some(p => p.pontos.at(-1)?.tipo !== "check_out")) throw new Error("Sequência de presença inválida.");
          presenca = { id: pendente.presencaId, pontos: [] };
          estado.presencas.push(presenca);
        }
        const pontos = acrescentarPonto(presenca.pontos, ponto, new Date().toISOString());
        const novo = pontos.at(-1)!;
        presenca.pontos.push({ ...novo, comandoId: pendente.comandoId, comandoEm: pendente.comandoEm });
        estado.conversa.pendente = null;
        const referencia = mensagem.location?.address || mensagem.location?.name ? " Endereço da localização guardado para a quilometragem." : "";
        textoResposta = pendente.tipo === "check_out" ? `Check-out registrado!${referencia}` : pendente.tipo === "check_in" ? `Check-in registrado!${referencia}` : `Checkpoint registrado!${referencia}`;
      }
    }
    estado.conversa.respostas.push({ id: mensagem.id, texto: textoResposta, hash });
    return { textoResposta };
  });
}

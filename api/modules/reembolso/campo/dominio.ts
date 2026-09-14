import { z } from "zod";

export const pontoSchema = z.object({
  id: z.string().min(1).max(128),
  tipo: z.enum(["check_in", "checkpoint", "check_out"]),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  ocorridoEm: z.string().datetime({ offset: true }),
  precisaoMetros: z.number().finite().nonnegative().optional(),
});
export type Ponto = z.infer<typeof pontoSchema> & { recebidoEm: string };
export interface Jornada {
  id: string;
  veiculo: string;
  consumoKmLitro: number | null;
  pontos: Ponto[];
  calculo: {
    estado: "aguardando_calculo" | "estimado";
    metros: number | null;
    calculadoEm: string | null;
    consultaId?: string;
    ultimaTentativaEm?: string;
    proximaTentativaEm?: string;
    tentativas?: number;
    erro?: string | null;
  };
}
export interface Documento {
  id: string;
  chave: string | null;
  hash: string;
  cnpjDestinatario: string | null;
  veiculo: string;
  data: string | null;
  litros: number | null;
  estado: "em_validacao" | "regular" | "divergente";
  motivo: string | null;
  notaFiscalId?: number;
  camposPendentes?: string[];
  provedorExtracao?: string;
  extraidoEm?: string;
}
export interface Conciliacao {
  inicio: string;
  fim: string;
  veiculo: string;
  estado: "conciliado" | "documentacao_pendente" | "divergencia" | "revisao";
  metrosEstimados: number | null;
  litrosDocumentados: number;
  litrosEsperados: number | null;
  jornadas: string[];
  documentos: string[];
  lembrete: "pendente" | "cancelado";
  versao: number;
  memorialReembolso?: { uf: string; metrosComerciais: number; metrosNaoComerciais: number; tarifaCentavosPorKm: number; valorCentavos: number; politicaId: number; politicaVersao: number };
  lembretes?: { agendados: number; ultimoEm: string; referencias: string[] };
}
export interface Presenca {
  id: string;
  pontos: (Ponto & { comandoId: string; comandoEm: string })[];
  jornadaId?: string;
}
type ComandoPendente = { tipo: Ponto["tipo"]; expiraEm: string } & (
  | { fluxo: "presenca"; presencaId: string; comandoId: string; comandoEm: string }
  | { fluxo?: undefined; jornadaId: string; veiculo: string }
);
export interface EstadoCampo {
  presencas?: Presenca[];
  jornadas: Jornada[];
  documentos: Documento[];
  conciliacoes: Conciliacao[];
  historicoConciliacoes?: Conciliacao[];
  auditoria: { usuarioId: number | null; origem: "canal" | "backoffice"; em: string; acao: string }[];
  conversa?: { ultimaMensagemEm?: string; pendente: ComandoPendente | null; respostas: { id: string; texto: string; hash: string }[] };
}
export const novoEstadoCampo = (): EstadoCampo => ({ jornadas: [], documentos: [], conciliacoes: [], auditoria: [] });

/** Eventos imutáveis; reentrega idêntica é neutra e ID reutilizado diverge. */
export function adicionarPonto(jornada: Jornada, input: z.infer<typeof pontoSchema>, recebidoEm: string): Jornada {
  const pontos = acrescentarPonto(jornada.pontos, input, recebidoEm);
  return pontos === jornada.pontos ? jornada : { ...jornada, pontos, calculo: { estado: "aguardando_calculo", metros: null, calculadoEm: null } };
}

/** Validação compartilhada de sequência e imutabilidade; independe de cálculo financeiro. */
export function acrescentarPonto(pontos: Ponto[], input: z.infer<typeof pontoSchema>, recebidoEm: string): Ponto[] {
  const ponto = pontoSchema.parse(input);
  const anterior = pontos.find(p => p.id === ponto.id);
  if (anterior) {
    const original = pontoSchema.parse(anterior);
    if (JSON.stringify(original) !== JSON.stringify(ponto)) throw new Error("Identificador de evento já usado com outro conteúdo.");
    return pontos;
  }
  const ultimo = pontos.at(-1);
  if (ultimo?.tipo === "check_out") throw new Error("Jornada já encerrada.");
  if ((!ultimo && ponto.tipo !== "check_in") || (ultimo && ponto.tipo === "check_in")) throw new Error("Sequência de jornada inválida.");
  if (ultimo && Date.parse(ponto.ocorridoEm) < Date.parse(ultimo.ocorridoEm)) throw new Error("Evento atrasado exige revisão; não foi acrescentado à jornada.");
  if (Date.parse(ponto.ocorridoEm) > Date.parse(recebidoEm) + 300_000) throw new Error("Evento no futuro.");
  if (pontos.length >= 1000) throw new Error("Limite de pontos da jornada atingido.");
  return [...pontos, { ...ponto, recebidoEm }];
}

export function chaveFiscalValida(chave: string): boolean {
  if (!/^\d{44}$/.test(chave) || /^(\d)\1+$/.test(chave)) return false;
  let soma = 0;
  for (let i = 42, peso = 2; i >= 0; i--, peso = peso === 9 ? 2 : peso + 1) soma += Number(chave[i]) * peso;
  const digito = 11 - soma % 11;
  return Number(chave[43]) === (digito >= 10 ? 0 : digito);
}

/** Intervalos UTC [inicio, fim); uma jornada não atravessa dois consolidados. */
export function conciliar(estado: EstadoCampo, inicio: string, fim: string, veiculo: string): Conciliacao {
  const a = Date.parse(inicio), b = Date.parse(fim);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a >= b) throw new Error("Período inválido.");
  const jornadas = estado.jornadas.filter(j => j.veiculo === veiculo && j.pontos.some(p => Date.parse(p.ocorridoEm) >= a && Date.parse(p.ocorridoEm) < b));
  const documentos = estado.documentos.filter(d => d.veiculo === veiculo && (!d.data || Date.parse(d.data) >= a && Date.parse(d.data) < b));
  const incompleta = !jornadas.length || jornadas.some(j => j.pontos.at(-1)?.tipo !== "check_out" || j.calculo.metros === null || j.pontos.some(p => Date.parse(p.ocorridoEm) < a || Date.parse(p.ocorridoEm) >= b));
  const metros = incompleta ? null : jornadas.reduce((s, j) => s + j.calculo.metros!, 0);
  const consumoAusente = jornadas.some(j => !j.consumoKmLitro);
  const litrosEsperados = incompleta || consumoAusente ? null : jornadas.reduce((s, j) => s + j.calculo.metros! / 1000 / j.consumoKmLitro!, 0);
  const regulares = documentos.filter(d => d.estado === "regular");
  // Tanque/uso misto desconhecidos: não compara compra com consumo nem acusa fraude.
  const situacao = incompleta || consumoAusente ? "revisao" : documentos.some(d => d.estado === "divergente") ? "divergencia" : documentos.some(d => d.estado === "em_validacao") ? "revisao" : regulares.length ? "conciliado" : "documentacao_pendente";
  const anterior = estado.conciliacoes.find(c => c.inicio === inicio && c.fim === fim && c.veiculo === veiculo);
  if (estado.conciliacoes.some(c => c.veiculo === veiculo && c !== anterior && Date.parse(c.inicio) < b && Date.parse(c.fim) > a)) throw new Error("Período sobreposto: revise a conciliação existente.");
  return { inicio, fim, veiculo, estado: situacao, metrosEstimados: metros, litrosDocumentados: regulares.reduce((s, d) => s + (d.litros ?? 0), 0), litrosEsperados, jornadas: jornadas.map(j => j.id), documentos: documentos.map(d => d.id), lembrete: situacao === "documentacao_pendente" ? "pendente" : "cancelado", versao: (anterior?.versao ?? 0) + 1, lembretes: anterior?.lembretes };
}

export function atualizarConciliacoes(estado: EstadoCampo): void {
  estado.historicoConciliacoes = [...(estado.historicoConciliacoes ?? []), ...estado.conciliacoes.map(c => ({ ...c }))];
  estado.conciliacoes = estado.conciliacoes.map(c => {
    const atual = conciliar(estado, c.inicio, c.fim, c.veiculo);
    // Regularizar documento não muda a base de cálculo já auditada. Nova distância exige nova segregação humana.
    if (atual.metrosEstimados === c.metrosEstimados) atual.memorialReembolso = c.memorialReembolso;
    return atual;
  });
}

export function metricasCampo(estado: EstadoCampo) {
  return { jornadas: estado.jornadas.length, jornadasIncompletas: estado.jornadas.filter(j => j.pontos.at(-1)?.tipo !== "check_out").length, documentos: estado.documentos.length, documentosRegulares: estado.documentos.filter(d => d.estado === "regular").length, pendenciasDocumentais: estado.conciliacoes.filter(c => c.estado === "documentacao_pendente").length, lembretesPendentes: estado.conciliacoes.filter(c => c.lembrete === "pendente").length };
}

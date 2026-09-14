export type StatusWhatsapp = "pendente" | "aceito" | "entregue" | "falhou" | "incerto" | "nao_configurado" | "limite_atingido"

export interface ResultadoConvite {
  linkAceite: string
  linkWhatsapp: string | null
  enviadoPorWhatsapp: boolean
  enviadoPorEmail: boolean
  email: string | null
  // Optional only during the coordinated rollout of the API contract.
  statusWhatsapp?: StatusWhatsapp
  messageIdWhatsapp?: string | null
}

const ESTADOS: Record<StatusWhatsapp, { titulo: string; descricao: string; bloquearReenvio: boolean }> = {
  pendente: { titulo: "WhatsApp: envio pendente", descricao: "Aguarde o processamento. Não reenvie enquanto o resultado estiver pendente.", bloquearReenvio: true },
  aceito: { titulo: "WhatsApp: envio aceito pela API", descricao: "A entrega ainda não foi confirmada. Aguarde a atualização do provedor antes de repetir o envio.", bloquearReenvio: true },
  entregue: { titulo: "WhatsApp: convite entregue", descricao: "A entrega foi confirmada pelo provedor; isso não significa que o colaborador aceitou o convite.", bloquearReenvio: true },
  falhou: { titulo: "WhatsApp: envio falhou", descricao: "O envio falhou. Confira o número e a configuração antes de tentar novamente ou compartilhar o link manualmente.", bloquearReenvio: false },
  incerto: { titulo: "WhatsApp: resultado não confirmado", descricao: "O envio pode ter ocorrido. Confira o status com o responsável antes de repetir; um novo envio pode duplicar o convite.", bloquearReenvio: true },
  limite_atingido: { titulo: "WhatsApp: limite de chamadas atingido", descricao: "O convite não foi enviado ao WhatsApp. Após a liberação de saldo, clique novamente em enviar convite.", bloquearReenvio: false },
  nao_configurado: { titulo: "WhatsApp: envio automático não configurado", descricao: "Você pode compartilhar o link do convite manualmente.", bloquearReenvio: false },
}

export function apresentacaoConvite(resultado: Pick<ResultadoConvite, "statusWhatsapp" | "enviadoPorWhatsapp">) {
  // A legacy true only proves API acceptance. A missing/unknown status cannot prove failure.
  const status = resultado.statusWhatsapp && Object.hasOwn(ESTADOS, resultado.statusWhatsapp)
    ? resultado.statusWhatsapp
    : resultado.enviadoPorWhatsapp ? "aceito" : "incerto"
  return { status, ...ESTADOS[status] }
}

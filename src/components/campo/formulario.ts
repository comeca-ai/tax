import { orientacaoVeiculo } from "@contracts/veiculos";

export function inteiroExplicito(
  valor: string,
  minimo: number,
  maximo: number
): number | null {
  if (!/^\d+$/.test(valor.trim())) return null;
  const numero = Number(valor);
  return Number.isSafeInteger(numero) && numero >= minimo && numero <= maximo
    ? numero
    : null;
}

export function periodoUtc(
  inicio: string,
  fim: string
): { inicio: string; fim: string } | null {
  if (!inicio || !fim) return null;
  const a = new Date(inicio),
    b = new Date(fim);
  if (!Number.isFinite(a.getTime()) || !Number.isFinite(b.getTime()) || a >= b)
    return null;
  return { inicio: a.toISOString(), fim: b.toISOString() };
}

export function dataPagamentoUtc(
  valor: string,
  agora = Date.now()
): string | null {
  if (!valor) return null;
  const data = new Date(valor);
  return Number.isFinite(data.getTime()) && data.getTime() <= agora
    ? data.toISOString()
    : null;
}

export function mensagemErroCampo(erro: unknown): string {
  const code = (erro as { data?: { code?: string } } | null)?.data?.code;
  const mensagens: Record<string, string> = {
    UNAUTHORIZED: "Sua sessão expirou. Entre novamente para continuar.",
    FORBIDDEN: "Você não tem permissão para operar este registro.",
    NOT_FOUND: "O registro não está disponível na empresa selecionada.",
    PRECONDITION_FAILED:
      "Confira a política ativa, o vínculo e o estado do registro antes de tentar novamente.",
    BAD_REQUEST:
      "Confira os campos, datas e evidências. Os dados não foram aceitos.",
    CONFLICT:
      "Já existe um registro com dados diferentes. Confira o histórico antes de repetir.",
  };
  return (
    mensagens[code ?? ""] ??
    "A operação não pôde ser confirmada. Tente novamente ou informe o horário ao responsável técnico."
  );
}

export function colaboradorDaEmpresa<
  T extends { id: number; empresaId: number },
>(lista: T[], empresaId: number, id: number | null): T | null {
  return lista.find(p => p.id === id && p.empresaId === empresaId) ?? null;
}

export function documentoRegularizavel(
  documento: {
    chave: string | null;
    notaFiscalId?: number;
    cnpjDestinatario: string | null;
    camposPendentes?: string[];
  },
  cnpjEmpresa: string
): boolean {
  return (
    !!documento.chave &&
    !!documento.notaFiscalId &&
    documento.cnpjDestinatario === cnpjEmpresa.replace(/\D/g, "") &&
    documento.camposPendentes !== undefined &&
    documento.camposPendentes.length === 0
  );
}

export const campoInputClass =
  "h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm disabled:opacity-50";
export const campoButtonClass =
  "inline-flex min-h-10 items-center justify-center rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50";

export function mensagemErroVeiculo(erro: unknown): string {
  const e = erro as { data?: { code?: string }; message?: string } | null;
  if (e?.data?.code === "CONFLICT")
    return "Esta placa já está cadastrada para o colaborador.";
  if (e?.data?.code === "BAD_REQUEST") {
    if (e.message === "Colaborador ativo da empresa não encontrado.")
      return "O vínculo do colaborador não está ativo. Atualize a equipe e selecione a pessoa novamente.";
    try {
      const orientacao = orientacaoVeiculo(JSON.parse(e.message ?? ""));
      if (orientacao) return orientacao;
    } catch {
      /* Mensagem não estruturada: mantém orientação segura. */
    }
    return "Confira a placa, o RENAVAM, a UF e o consumo declarado do veículo.";
  }
  return mensagemErroCampo(erro);
}

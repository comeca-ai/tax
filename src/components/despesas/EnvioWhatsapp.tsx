import {
  CATEGORIA_DESPESA_ROTULO,
  type CategoriaDespesa,
} from "@contracts/types";

export type DadosEnvioWhatsapp = {
  colaboradorId: number;
  nome: string;
  enviadoEm: Date | string;
};
export default function EnvioWhatsapp({
  envio,
  categoria,
}: {
  envio?: DadosEnvioWhatsapp | null;
  categoria: CategoriaDespesa | null;
}) {
  if (!envio) return null;
  const date = new Date(envio.enviadoEm);
  const valid = Number.isFinite(date.getTime());
  const horario = valid
    ? date.toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Horário não informado";
  return (
    <span
      className="flex flex-col gap-1 text-xs text-text-500"
      data-testid="envio-whatsapp"
    >
      <span>WhatsApp · {envio.nome}</span>
      <span>
        Enviado em{" "}
        <time dateTime={valid ? date.toISOString() : undefined}>{horario}</time>{" "}
        (Brasília)
      </span>
      <span className="w-fit rounded-full bg-brand-500/10 px-2 py-0.5 font-medium text-brand-500">
        {categoria ? CATEGORIA_DESPESA_ROTULO[categoria] : "A classificar"}
      </span>
    </span>
  );
}

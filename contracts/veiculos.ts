import { z } from "zod";
import { UFS_BRASIL } from "./empresas";

export const veiculoUnificadoInput = z.object({
  empresaId: z.number().int().positive(),
  colaboradorId: z.number().int().positive(),
  placa: z
    .string()
    .transform(v => v.toUpperCase().replace(/[-\s]/g, ""))
    .pipe(z.string().regex(/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/)),
  renavam: z
    .string()
    .trim()
    .regex(/^\d{9,11}$/),
  motorizacao: z.enum(["combustao", "hibrido", "eletrico"]),
  ufLicenciamento: z.enum(UFS_BRASIL),
  kmPorLitroDeclarado: z.number().finite().positive().max(100),
});

const orientacoes: Record<string, string> = {
  empresaId: "Selecione a empresa novamente.",
  colaboradorId: "Selecione um colaborador ativo da empresa.",
  placa: "Placa: use o formato ABC1234 ou ABC1D23.",
  renavam: "RENAVAM: informe de 9 a 11 dígitos, mantendo os zeros iniciais.",
  motorizacao: "Selecione a motorização: combustão, híbrido ou elétrico.",
  ufLicenciamento: "Selecione a UF de licenciamento.",
  kmPorLitroDeclarado:
    "Consumo declarado: informe um valor maior que zero e até 100 km/L.",
};

/** Somente orientações fixas, nunca os valores informados ou mensagens internas. */
export function orientacaoVeiculo(issues: unknown): string | null {
  if (!Array.isArray(issues)) return null;
  const campos = new Set(
    issues.flatMap(i =>
      i &&
      Array.isArray(i.path) &&
      i.path.length === 1 &&
      typeof i.path[0] === "string" &&
      Object.hasOwn(orientacoes, i.path[0])
        ? [i.path[0] as string]
        : []
    )
  );
  return [...campos].map(c => orientacoes[c]).join(" ") || null;
}

export function consumoVeiculo(valor: string): number {
  const limpo = valor.trim();
  return /^\d+(?:[.,]\d+)?$/.test(limpo)
    ? Number(limpo.replace(",", "."))
    : NaN;
}

import { useEffect, useMemo } from "react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { formatarNumero } from "@/components/ops/rotulos"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

/** Tolerância padrão do motor (RF-09) — api/engine/params.ts */
export const TOLERANCIA_CONSUMO = 0.15

const veiculoFormSchema = z.object({
  descricao: z.string().max(255).optional(),
  placa: z
    .string()
    .min(7, "Placa incompleta")
    .max(8, "Placa inválida")
    .regex(/^[A-Z]{3}-?[0-9][A-Z0-9][0-9]{2}$/, "Formato esperado: ABC-1234 ou ABC-1D23 (Mercosur)"),
  renavam: z
    .string()
    .regex(/^\d{0,11}$/, "RENAVAM tem até 11 dígitos")
    .optional(),
  kmPorLitroDeclarado: z.coerce
    .number({ message: "Informe o consumo declarado" })
    .positive("Deve ser maior que zero"),
  tarifaReembolsoKm: z.coerce
    .number({ message: "Informe a tarifa" })
    .min(0, "Não pode ser negativa"),
})

export type VeiculoFormValores = z.infer<typeof veiculoFormSchema>

/** Máscara de placa Mercosur-aware: ABC-1234 / ABC-1D23, sempre maiúscula. */
export function mascaraPlaca(valor: string): string {
  const limpo = valor.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7)
  if (limpo.length <= 3) return limpo
  return `${limpo.slice(0, 3)}-${limpo.slice(3)}`
}

const inputCls = cn(
  "h-11 w-full rounded-[10px] border border-line bg-surface px-3.5 text-sm text-text-900 outline-none transition-[border,box-shadow] duration-150 placeholder:text-text-500/60",
  "focus:border-brand-500 focus:shadow-[0_0_0_3px_rgba(14,169,104,0.18)]",
)

function Campo({ label, erro, helper, children }: { label: string; erro?: string; helper?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium uppercase tracking-[0.04em] text-text-500">{label}</span>
      {children}
      {erro ? (
        <span className="text-[12px] font-medium text-red-500">{erro}</span>
      ) : helper ? (
        <span className="text-[12px] leading-snug text-text-500">{helper}</span>
      ) : null}
    </div>
  )
}

interface VeiculoFormDialogProps {
  aberto: boolean
  onFechar: () => void
  valoresIniciais?: Partial<VeiculoFormValores>
  titulo: string
  submitLabel?: string
  /** Consumo real agregado (km/L) derivado das despesas — para o preview de divergência. */
  consumoReal?: number | null
  onSubmit: (valores: VeiculoFormValores) => Promise<void> | void
}

/** Modal Cadastrar/Editar veículo (RF-09: km/L declarado e tarifa alimentam o motor). */
export default function VeiculoFormDialog({
  aberto,
  onFechar,
  valoresIniciais,
  titulo,
  submitLabel = "Salvar veículo",
  consumoReal,
  onSubmit,
}: VeiculoFormDialogProps) {
  const form = useForm<z.input<typeof veiculoFormSchema>, unknown, VeiculoFormValores>({
    resolver: zodResolver(veiculoFormSchema),
    defaultValues: {
      descricao: "",
      placa: "",
      renavam: "",
      kmPorLitroDeclarado: undefined as unknown as number,
      tarifaReembolsoKm: 0,
      ...valoresIniciais,
    },
  })
  const { control, register, handleSubmit, formState, watch, reset } = form

  useEffect(() => {
    if (aberto) {
      reset({
        descricao: "",
        placa: "",
        renavam: "",
        kmPorLitroDeclarado: undefined as unknown as number,
        tarifaReembolsoKm: 0,
        ...valoresIniciais,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto])

  const declarado = Number(watch("kmPorLitroDeclarado"))
  const previewDivergencia = useMemo(() => {
    if (!consumoReal || !Number.isFinite(declarado) || declarado <= 0) return null
    const div = Math.abs(consumoReal - declarado) / declarado
    return { pct: div * 100, dentro: div <= TOLERANCIA_CONSUMO }
  }, [consumoReal, declarado])

  const submit = handleSubmit(async (valores) => {
    try {
      await onSubmit(valores)
      onFechar()
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível salvar o veículo.")
    }
  })

  return (
    <Dialog open={aberto} onOpenChange={(open) => !open && onFechar()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>
            O consumo declarado alimenta o teste de plausibilidade (RF-09); a tarifa define o
            reembolso por km comercial.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
          <Campo label="Modelo / descrição" erro={formState.errors.descricao?.message}>
            <input {...register("descricao")} placeholder="Fiorino 1.4 2021" className={inputCls} />
          </Campo>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo label="Placa" erro={formState.errors.placa?.message}>
              <Controller
                control={control}
                name="placa"
                render={({ field }) => (
                  <input
                    value={field.value}
                    onChange={(e) => field.onChange(mascaraPlaca(e.target.value))}
                    placeholder="ABC-1D23"
                    className={cn(inputCls, "font-mono uppercase tabular")}
                  />
                )}
              />
            </Campo>
            <Campo label="RENAVAM" erro={formState.errors.renavam?.message}>
              <Controller
                control={control}
                name="renavam"
                render={({ field }) => (
                  <input
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value.replace(/\D/g, "").slice(0, 11))}
                    placeholder="00481221407"
                    inputMode="numeric"
                    className={cn(inputCls, "font-mono tabular")}
                  />
                )}
              />
            </Campo>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              label="Consumo declarado (km/L)"
              erro={formState.errors.kmPorLitroDeclarado?.message}
              helper="Usado no teste de plausibilidade (RF-09)."
            >
              <input
                {...register("kmPorLitroDeclarado")}
                type="number"
                step="0.1"
                min="0"
                placeholder="10,5"
                className={cn(inputCls, "font-mono tabular")}
              />
            </Campo>
            <Campo
              label="Tarifa de reembolso (R$/km)"
              erro={formState.errors.tarifaReembolsoKm?.message}
              helper="Reembolsável = tarifa × km comercial. Independente do valor fiscal."
            >
              <input
                {...register("tarifaReembolsoKm")}
                type="number"
                step="0.01"
                min="0"
                placeholder="0,95"
                className={cn(inputCls, "font-mono tabular")}
              />
            </Campo>
          </div>
          <p className="rounded-[10px] bg-paper px-3.5 py-2.5 text-[12px] leading-snug text-text-500">
            Tolerância de divergência do motor: <span className="font-mono tabular">15%</span>.
            Acima disso, despesas de combustível deste veículo são rebaixadas para revisão.
          </p>

          {previewDivergencia && (
            <p
              className={cn(
                "rounded-[10px] border-l-[3px] px-3.5 py-2.5 font-mono text-[12px] tabular",
                previewDivergencia.dentro
                  ? "border-brand-500 bg-conf-alta-bg/60 text-conf-alta-text"
                  : "border-red-500 bg-conf-vedado-bg/60 text-conf-vedado-text",
              )}
            >
              Com os valores atuais: divergência {formatarNumero(previewDivergencia.pct)}% —{" "}
              {previewDivergencia.dentro ? "dentro da tolerância" : "acima da tolerância (rebaixa para revisão)"}
            </p>
          )}

          <DialogFooter>
            <button
              type="button"
              onClick={onFechar}
              className="inline-flex h-10 items-center rounded-[10px] border border-line px-4 text-sm font-medium text-text-900 transition hover:bg-paper"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={formState.isSubmitting}
              className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-brand-500 px-5 text-sm font-semibold text-white transition hover:-translate-y-px hover:bg-brand-500/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {formState.isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitLabel}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

import { useRef, useState } from "react"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { useGSAP } from "@gsap/react"
import ConfidenceBadge from "@/components/app/ConfidenceBadge"
import RuleChip from "@/components/app/RuleChip"

gsap.registerPlugin(ScrollTrigger, useGSAP)

const STEPS = [
  {
    num: "01",
    title: "Envie a nota",
    caption: "Foto ou PDF, direto na plataforma. Multi-upload e arrastar-e-soltar.",
    content: (
      <div className="flex h-full flex-col items-center justify-center gap-5 p-8 text-center">
        <img src="/ocr-scan.svg" alt="Nota fiscal sendo escaneada pelo OCR" className="h-auto w-full max-w-[360px]" />
        <p className="text-sm leading-relaxed text-text-dark-400">
          Foto ou PDF, direto na plataforma. Multi-upload e arrastar-e-soltar.
        </p>
        <span className="rounded-full border border-line-dark px-3 py-1 font-mono text-[11px] tracking-[0.02em] text-text-dark-400">
          JPG · PNG · PDF · até 10MB
        </span>
      </div>
    ),
  },
  {
    num: "02",
    title: "OCR extrai os campos",
    caption: "Cada campo sai com um índice de confiança. Baixa confiança? Você revisa antes de processar — preenchimento assistido.",
    content: (
      <div className="flex h-full flex-col justify-center gap-5 p-8">
        <div className="flex flex-col gap-3 rounded-xl border border-line-dark bg-ink-950 p-5">
          {[
            { label: "CNPJ emitente", value: "04.812.214/0001-07", conf: 98 },
            { label: "CFOP", value: "5.656", conf: 97 },
            { label: "NCM", value: "2710.12", conf: 95 },
            { label: "Valor", value: "R$ 487,30", conf: 82 },
          ].map((f) => (
            <div key={f.label} className="flex items-center justify-between gap-4">
              <span className="text-[13px] text-text-dark-400">{f.label}</span>
              <span className="flex items-center gap-2 font-mono text-[13px] tabular text-text-dark-100">
                {f.value}
                <span
                  className={`h-2 w-2 rounded-full ${f.conf >= 90 ? "bg-conf-alta-dot" : "cursor-pointer bg-conf-media-dot"}`}
                  title={f.conf >= 90 ? `OCR ${f.conf}%` : `OCR ${f.conf}% · confira o campo`}
                />
              </span>
            </div>
          ))}
        </div>
        <p className="text-sm leading-relaxed text-text-dark-400">
          Cada campo sai com um índice de confiança. Baixa confiança? Você revisa antes de processar — preenchimento
          assistido.
        </p>
      </div>
    ),
  },
  {
    num: "03",
    title: "O motor classifica",
    caption: "Categoria × CNAE × regime tributário. A regra aplicada é a vigente na data do fato gerador — versionamento regulatório até 2033.",
    content: (
      <div className="flex h-full flex-col justify-center gap-5 p-8">
        <div className="flex flex-col items-start gap-4 rounded-xl border border-line-dark bg-ink-950 p-5">
          <div className="flex flex-wrap items-center gap-2 font-mono text-[13px] tabular text-text-dark-100">
            <span className="rounded-md bg-ink-800 px-2 py-1">CNAE 49.30-2</span>
            <span className="text-text-dark-400">×</span>
            <span className="rounded-md bg-ink-800 px-2 py-1">Combustível</span>
            <span className="text-text-dark-400">→</span>
            <ConfidenceBadge level="alta" />
          </div>
          <span className="inline-flex items-center rounded-md border border-line-dark px-2 py-1 font-mono text-[11px] tracking-[0.02em] text-text-dark-400">
            regra v1.1 · vigente na data do fato gerador
          </span>
          <RuleChip label="IN RFB 2.121/2024 · art. 372" className="border-line-dark bg-ink-800 text-text-dark-400 hover:border-brand-400/40 hover:text-brand-400" />
        </div>
        <p className="text-sm leading-relaxed text-text-dark-400">
          Categoria × CNAE × regime tributário. A regra aplicada é a vigente na data do fato gerador — versionamento
          regulatório até 2033.
        </p>
      </div>
    ),
  },
  {
    num: "04",
    title: "Crédito quantificado",
    caption: "Memorial de cálculo completo, valor capturável separado do identificado, e trilha de auditoria imutável.",
    content: (
      <div className="flex h-full flex-col justify-center gap-5 p-8">
        <div className="flex flex-col gap-3 rounded-xl border border-line-dark bg-ink-950 p-5">
          <div className="flex items-center justify-between gap-4 border-b border-dashed border-line-dark pb-3">
            <span className="text-[13px] text-text-dark-400">PIS/COFINS 9,25% × base R$ 438,57</span>
            <span className="font-mono text-sm font-semibold tabular text-brand-400">= R$ 40,57</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-[13px] text-text-dark-400">IRPJ+CSLL 34% × base dedutível</span>
            <span className="font-mono text-sm font-semibold tabular text-brand-400">= R$ 148,96</span>
          </div>
          <p className="mt-1 font-mono text-[11px] tracking-[0.02em] text-text-dark-400">
            crédito e dedutibilidade em trilhas paralelas — nunca somados
          </p>
        </div>
        <p className="text-sm leading-relaxed text-text-dark-400">
          Memorial de cálculo completo, valor capturável separado do identificado, e trilha de auditoria imutável.
        </p>
      </div>
    ),
  },
]

export default function ComoFunciona() {
  const root = useRef<HTMLElement>(null)
  const [active, setActive] = useState(0)
  const [reducedMotion] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  )

  useGSAP(
    () => {
      if (reducedMotion) return
      const railFill = root.current?.querySelector(".rail-fill")
      ScrollTrigger.create({
        trigger: root.current,
        start: "top top",
        end: "+=100%",
        pin: true,
        scrub: true,
        onUpdate: (self) => {
          const step = Math.min(3, Math.floor(self.progress * 4))
          setActive((prev) => (prev === step ? prev : step))
          if (railFill) gsap.set(railFill, { scaleY: self.progress })
        },
      })
    },
    { scope: root, dependencies: [reducedMotion] },
  )

  if (reducedMotion) {
    return (
      <section id="como-funciona" ref={root} className="bg-ink-950 py-24">
        <div className="mx-auto max-w-[1200px] px-6">
          <p className="font-mono text-xs uppercase tracking-[0.06em] text-brand-400">Como funciona</p>
          <h2 className="mt-3 max-w-xl font-display text-[clamp(30px,4vw,48px)] font-semibold leading-tight tracking-[-0.02em] text-text-dark-100">
            Da nota fiscal ao crédito apurado em quatro passos.
          </h2>
          <div className="mt-12 grid gap-6 md:grid-cols-2">
            {STEPS.map((step) => (
              <div key={step.num} className="rounded-2xl border border-line-dark bg-ink-800">
                <div className="border-b border-line-dark px-6 py-4">
                  <span className="font-mono text-xs text-brand-400">{step.num}</span>
                  <h3 className="mt-1 font-display text-xl font-medium text-text-dark-100">{step.title}</h3>
                </div>
                <div className="min-h-[280px]">{step.content}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    )
  }

  return (
    <section id="como-funciona" ref={root} className="flex min-h-[100dvh] items-center bg-ink-950 py-16">
      <div className="mx-auto grid w-full max-w-[1200px] gap-12 px-6 lg:grid-cols-[1fr_640px]">
        {/* left sticky column */}
        <div className="flex flex-col justify-center">
          <p className="font-mono text-xs uppercase tracking-[0.06em] text-brand-400">Como funciona</p>
          <h2 className="mt-3 font-display text-[clamp(30px,4vw,48px)] font-semibold leading-[1.08] tracking-[-0.02em] text-text-dark-100">
            Da nota fiscal ao crédito apurado em quatro passos.
          </h2>
          <div className="relative mt-10 flex flex-col gap-8 pl-8">
            <span className="absolute left-[calc(2rem+13px)] top-2 h-[calc(100%-16px)] w-px bg-line-dark" aria-hidden />
            <span
              className="rail-fill absolute left-[calc(2rem+13px)] top-2 h-[calc(100%-16px)] w-px origin-top bg-brand-400"
              style={{ transform: "scaleY(0)" }}
              aria-hidden
            />
            {STEPS.map((step, i) => (
              <div key={step.num} className="flex items-center gap-4">
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border font-mono text-[11px] transition-all duration-300 ${
                    i <= active
                      ? "scale-110 border-brand-400 bg-ink-950 text-brand-400"
                      : "border-line-dark bg-ink-950 text-text-dark-400"
                  }`}
                >
                  {step.num}
                </span>
                <span
                  className={`text-[15px] font-medium transition-colors duration-300 ${
                    i === active ? "text-text-dark-100" : "text-text-dark-400"
                  }`}
                >
                  {step.title}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* right card */}
        <div className="flex items-center">
          <div className="h-[460px] w-full overflow-hidden rounded-2xl border border-line-dark bg-ink-800 shadow-[0_24px_64px_-24px_rgba(0,0,0,0.6)]">
            <div key={active} className="animate-step-in h-full">
              {STEPS[active].content}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

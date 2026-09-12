import { useRef } from "react"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { SplitText } from "gsap/SplitText"
import { useGSAP } from "@gsap/react"

gsap.registerPlugin(ScrollTrigger, SplitText, useGSAP)

const CREDIT_CARDS = [
  {
    tag: "9,25%",
    title: "PIS/COFINS",
    description:
      "Diesel e GLP sobre base elegível. Zerado por MP 1.340/2026 desde 11/03/2026 — o motor aplica a regra pela data do fato gerador, sem erro de vigência.",
    chip: "MP 1.340/2026",
  },
  {
    tag: "ad rem",
    title: "ICMS monofásico",
    description:
      "Combustíveis: alíquota ad rem × litros, por UF. O OCR captura os litros da nota; a alíquota vem da tabela estadual versionada.",
    chip: "Convênio ICMS",
  },
  {
    tag: "2027+",
    title: "CBS/IBS",
    description:
      "Valor destacado na nota no regime pleno da reforma tributária. Já mapeado na matriz de regras — você não reaprende o sistema em 2027.",
    chip: "LC 214/2025",
  },
]

function Tag({ children }: { children: string }) {
  return (
    <span className="shimmer-tag inline-flex rounded-md border border-brand-400/30 px-2 py-0.5 font-mono text-[11px] tracking-[0.02em] text-brand-400">
      {children}
    </span>
  )
}

function Chip({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center rounded-md border border-line-dark px-2 py-1 font-mono text-[11px] tracking-[0.02em] text-text-dark-400">
      {children}
    </span>
  )
}

export default function Tributos() {
  const root = useRef<HTMLElement>(null)

  useGSAP(
    () => {
      const split = new SplitText(".tributos-h2", { type: "words" })
      gsap.fromTo(
        split.words,
        { y: 24, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.5,
          stagger: 0.04,
          ease: "power3.out",
          scrollTrigger: { trigger: root.current, start: "top 80%" },
        },
      )
      gsap.fromTo(
        ".tributo-card",
        { y: 40, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.6,
          stagger: 0.1,
          ease: "power3.out",
          scrollTrigger: { trigger: ".tributos-grid", start: "top 80%" },
        },
      )
      return () => split.revert()
    },
    { scope: root },
  )

  return (
    <section id="tributos" ref={root} className="bg-ink-950 py-24">
      <div className="mx-auto max-w-[1200px] px-6">
        <h2 className="tributos-h2 max-w-2xl font-display text-[clamp(30px,4vw,48px)] font-semibold leading-[1.08] tracking-[-0.02em] text-text-dark-100">
          Cinco frentes de recuperação. Duas trilhas paralelas.
        </h2>
        <p className="mt-4 max-w-xl text-[15px] leading-[1.6] text-text-dark-400">
          Crédito tributário e dedutibilidade são apurados em paralelo — nunca somados. Você vê cada real por tributo.
        </p>

        <div className="tributos-grid mt-12 grid gap-8 lg:grid-cols-2">
          {/* Créditos */}
          <div className="flex flex-col gap-4">
            <span className="font-mono text-xs uppercase tracking-[0.06em] text-text-dark-400">Créditos</span>
            {CREDIT_CARDS.map((card) => (
              <article
                key={card.title}
                className="tributo-card group rounded-2xl border border-line-dark bg-ink-800 p-6 opacity-0 transition-all duration-200 hover:-translate-y-1 hover:border-brand-400/40"
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-display text-xl font-medium tracking-[-0.01em] text-text-dark-100">{card.title}</h3>
                  <Tag>{card.tag}</Tag>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-text-dark-400">{card.description}</p>
                <div className="mt-4">
                  <Chip>{card.chip}</Chip>
                </div>
              </article>
            ))}
          </div>

          {/* Dedutibilidade */}
          <div className="flex flex-col gap-4">
            <span className="font-mono text-xs uppercase tracking-[0.06em] text-text-dark-400">Dedutibilidade</span>
            <article className="tributo-card group flex flex-1 flex-col rounded-2xl border border-line-dark bg-ink-800 p-6 opacity-0 transition-all duration-200 hover:-translate-y-1 hover:border-brand-400/40">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-display text-xl font-medium tracking-[-0.01em] text-text-dark-100">IRPJ + CSLL</h3>
                <Tag>25% + 9%</Tag>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-text-dark-400">
                Dedutibilidade sobre base = despesa − crédito CBS − crédito IBS. Regra única para qualquer CNAE, sempre
                Alta confiança. Uso misto (veículo): a base usa só o % comercial — km_comercial ÷ km total.
              </p>
              <div className="mt-4 flex gap-2">
                <Chip>RIR/2018</Chip>
                <Chip>uso misto segregado</Chip>
              </div>
              <div className="mt-auto pt-6">
                <div className="rounded-xl border border-dashed border-line-dark p-4 font-mono text-[12px] leading-relaxed tracking-[0.02em] text-text-dark-400">
                  base_dedutível = despesa − crédito_CBS − crédito_IBS
                  <br />
                  %comercial = km_comercial ÷ (km_comercial + km_não_comercial)
                </div>
              </div>
            </article>
          </div>
        </div>
      </div>
    </section>
  )
}

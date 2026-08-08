import { useRef } from "react"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { SplitText } from "gsap/SplitText"
import { useGSAP } from "@gsap/react"
import { Lock, CalendarCheck, Database, FileCheck } from "lucide-react"

gsap.registerPlugin(ScrollTrigger, SplitText, useGSAP)

const CARDS = [
  {
    icon: Lock,
    title: "Trilha imutável",
    text: "Cada classificação grava regra, versão, data e usuário. O log de auditoria não pode ser editado nem apagado.",
  },
  {
    icon: CalendarCheck,
    title: "Regra vigente na data do fato",
    text: "Versionamento regulatório até 2033. Quando uma MP muda a alíquota, o motor aplica cada regra no seu período — retroativo sem retrabalho.",
  },
  {
    icon: Database,
    title: "Banco local na plataforma",
    text: "Nada para instalar ou configurar: seu banco de dados é provisionado automaticamente no cadastro. Dados isolados por empresa (multi-tenant).",
  },
  {
    icon: FileCheck,
    title: "Evidência documental",
    text: "Média confiança só avança com documento de suporte anexado. A fila de revisão humana separa o automático do que precisa de olho humano.",
  },
]

export default function Seguranca() {
  const root = useRef<HTMLElement>(null)

  useGSAP(
    () => {
      const split = new SplitText(".seg-h2", { type: "words" })
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
        ".seg-card",
        { y: 32, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.55,
          stagger: 0.1,
          ease: "power3.out",
          scrollTrigger: { trigger: ".seg-grid", start: "top 80%" },
        },
      )
      return () => split.revert()
    },
    { scope: root },
  )

  return (
    <section id="seguranca" ref={root} className="bg-ink-950 py-24">
      <div className="mx-auto max-w-[1200px] px-6">
        <h2 className="seg-h2 max-w-2xl font-display text-[clamp(30px,4vw,48px)] font-semibold leading-[1.08] tracking-[-0.02em] text-text-dark-100">
          Feito para passar em auditoria.
        </h2>
        <div className="seg-grid mt-12 grid gap-4 md:grid-cols-2">
          {CARDS.map((card) => (
            <article
              key={card.title}
              className="seg-card group rounded-2xl border border-line-dark bg-ink-800 p-7 opacity-0 transition-colors duration-200 hover:border-brand-400/40"
            >
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand-400/10 ring-1 ring-brand-400/25 transition-transform duration-200 group-hover:-rotate-6 group-hover:scale-105">
                <card.icon className="h-5 w-5 text-brand-400" />
              </span>
              <h3 className="mt-4 font-display text-xl font-medium tracking-[-0.01em] text-text-dark-100">{card.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-dark-400">{card.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

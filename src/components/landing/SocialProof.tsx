import { useRef } from "react"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { useGSAP } from "@gsap/react"
import { Truck, HardHat, Wrench, ShieldCheck, HeartPulse } from "lucide-react"

gsap.registerPlugin(ScrollTrigger, useGSAP)

const SECTORS = [
  { icon: Truck, label: "Transporte de cargas" },
  { icon: HardHat, label: "Construção civil" },
  { icon: Wrench, label: "Manutenção industrial" },
  { icon: ShieldCheck, label: "Segurança privada" },
  { icon: HeartPulse, label: "Saúde domiciliar" },
]

export default function SocialProof() {
  const root = useRef<HTMLElement>(null)

  useGSAP(
    () => {
      gsap.fromTo(
        ".sector-chip",
        { x: -24, opacity: 0 },
        {
          x: 0,
          opacity: 1,
          duration: 0.5,
          stagger: 0.08,
          ease: "power3.out",
          scrollTrigger: { trigger: root.current, start: "top 85%" },
        },
      )
    },
    { scope: root },
  )

  return (
    <section ref={root} className="border-y border-line-dark bg-ink-950">
      <div className="mx-auto flex h-24 max-w-[1200px] flex-col items-center justify-center gap-3 px-6 lg:flex-row lg:gap-8">
        <span className="whitespace-nowrap font-mono text-xs uppercase tracking-[0.06em] text-text-dark-400">
          Feito para pequenas empresas brasileiras
        </span>
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          {SECTORS.map((sector) => (
            <span
              key={sector.label}
              className="sector-chip group inline-flex h-8 cursor-default items-center gap-2 rounded-full border border-line-dark px-3.5 text-[13px] font-medium text-text-dark-400 opacity-0 transition-colors duration-200 hover:border-brand-400/50 hover:text-text-dark-100"
            >
              <sector.icon className="h-3.5 w-3.5 transition-colors duration-200 group-hover:text-brand-400" />
              {sector.label}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

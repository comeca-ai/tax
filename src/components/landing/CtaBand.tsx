import { useRef } from "react"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { SplitText } from "gsap/SplitText"
import { useGSAP } from "@gsap/react"
import { Link } from "react-router"
import { ArrowRight } from "lucide-react"

gsap.registerPlugin(ScrollTrigger, SplitText, useGSAP)

export default function CtaBand() {
  const root = useRef<HTMLElement>(null)

  useGSAP(
    () => {
      gsap.fromTo(
        ".cta-band",
        { scale: 0.96, opacity: 0 },
        {
          scale: 1,
          opacity: 1,
          duration: 0.6,
          ease: "power3.out",
          scrollTrigger: { trigger: root.current, start: "top 85%" },
        },
      )
      const split = new SplitText(".cta-h2", { type: "words" })
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
      return () => split.revert()
    },
    { scope: root },
  )

  return (
    <section ref={root} className="bg-ink-950 px-6 py-24">
      <div
        className="cta-band bg-dotted-grid-dark relative mx-auto flex max-w-[1200px] flex-col items-center overflow-hidden rounded-3xl px-6 py-20 text-center"
        style={{ background: "linear-gradient(135deg, #0B3D2A, #070B09)" }}
      >
        <div className="bg-dotted-grid-dark pointer-events-none absolute inset-0" aria-hidden />
        <h2 className="cta-h2 relative font-display text-[clamp(30px,4vw,48px)] font-semibold tracking-[-0.02em] text-text-dark-100">
          Comece a recuperar hoje.
        </h2>
        <p className="relative mt-4 max-w-md text-[15px] leading-[1.6] text-text-dark-400">
          Cadastro em 3 minutos. Suba a primeira nota e veja o que sua empresa já deixou na mesa.
        </p>
        <Link
          to="/cadastro"
          className="animate-glow-pulse relative mt-8 inline-flex h-[52px] items-center gap-2 rounded-[10px] bg-brand-500 px-7 text-[15px] font-semibold text-white transition hover:scale-[1.02] hover:bg-brand-500/90"
        >
          Criar conta grátis
          <ArrowRight className="h-4 w-4" />
        </Link>
        <p className="relative mt-4 font-mono text-[11px] tracking-[0.02em] text-text-dark-400">
          sem cartão · cancele quando quiser
        </p>
      </div>
    </section>
  )
}

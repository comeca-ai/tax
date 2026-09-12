import { useRef } from "react"
import { Link } from "react-router"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { SplitText } from "gsap/SplitText"
import { useGSAP } from "@gsap/react"
import { ArrowRight, Play, CheckCircle2 } from "lucide-react"
import ConfidenceBadge from "@/components/app/ConfidenceBadge"

gsap.registerPlugin(ScrollTrigger, SplitText, useGSAP)

const ANNOTATIONS = [
  { text: "NCM 2710.12", className: "left-[6%] top-[24%]", delay: "0s" },
  { text: "CFOP 5.101", className: "right-[7%] top-[30%]", delay: "1.4s" },
  { text: "PIS/COFINS 9,25%", className: "left-[9%] top-[62%]", delay: "2.6s" },
  { text: "vigente desde 11/03/2026", className: "right-[6%] top-[70%]", delay: "3.8s" },
]

const KPI_MOCKS = [
  { label: "Identificado", value: "R$ 48.210,35" },
  { label: "Capturável", value: "R$ 31.904,12" },
  { label: "Em revisão", value: "R$ 7.118,60" },
]

const ROW_MOCKS = [
  { desc: "Diesel S10 · Posto Rodovia", date: "12/03/2026", value: "R$ 487,30", level: "alta" as const },
  { desc: "Hospedagem · Hotel Centro", date: "10/03/2026", value: "R$ 356,00", level: "media" as const },
  { desc: "Revenda de combustível", date: "08/03/2026", value: "R$ 1.920,00", level: "vedado" as const },
]

function HeroMock() {
  return (
    <div className="hero-mock relative mx-auto w-full max-w-[880px]" style={{ perspective: "1200px" }}>
      <div
        className="hero-mock-inner relative overflow-hidden rounded-2xl border border-line-dark bg-ink-900 shadow-[0_40px_80px_-24px_rgba(0,0,0,0.7),0_0_80px_-20px_rgba(43,224,140,0.25)]"
        style={{ transform: "rotateX(8deg)", transformStyle: "preserve-3d" }}
      >
        {/* browser chrome */}
        <div className="flex h-10 items-center gap-3 border-b border-line-dark bg-ink-800 px-4">
          <span className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-line-dark" />
            <span className="h-2.5 w-2.5 rounded-full bg-line-dark" />
            <span className="h-2.5 w-2.5 rounded-full bg-line-dark" />
          </span>
          <span className="flex h-6 flex-1 items-center rounded-md bg-ink-950 px-3 font-mono text-[10px] text-text-dark-400">
            app.reembolsa.ia/dashboard
          </span>
        </div>
        <div className="flex">
          {/* sidebar silhouette */}
          <div className="hidden w-16 flex-col items-center gap-3 border-r border-line-dark bg-ink-900 py-4 sm:flex">
            <img src="/logo-mark.svg" alt="" className="h-6 w-6" />
            {[0, 1, 2, 3, 4].map((i) => (
              <span key={i} className={`h-7 w-7 rounded-md ${i === 0 ? "bg-brand-400/20 ring-1 ring-brand-400/40" : "bg-ink-800"}`} />
            ))}
          </div>
          <div className="flex-1 p-5">
            {/* KPI cards */}
            <div className="grid grid-cols-3 gap-3">
              {KPI_MOCKS.map((kpi) => (
                <div key={kpi.label} className="rounded-lg border border-line-dark bg-ink-800 p-3">
                  <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-text-dark-400">{kpi.label}</p>
                  <p className="mt-1 font-mono text-sm font-semibold tabular text-text-dark-100 sm:text-base">{kpi.value}</p>
                </div>
              ))}
            </div>
            {/* mini area chart */}
            <div className="mt-3 rounded-lg border border-line-dark bg-ink-800 p-3">
              <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-text-dark-400">Evolução por categoria</p>
              <svg viewBox="0 0 560 110" className="mt-2 h-24 w-full" preserveAspectRatio="none">
                <path
                  d="M0 90 C60 84 90 60 140 62 C190 64 220 40 280 38 C340 36 370 52 420 34 C470 18 520 22 560 12 L560 110 L0 110 Z"
                  fill="rgba(43,224,140,0.12)"
                />
                <path
                  d="M0 90 C60 84 90 60 140 62 C190 64 220 40 280 38 C340 36 370 52 420 34 C470 18 520 22 560 12"
                  fill="none"
                  stroke="#2BE08C"
                  strokeWidth="2"
                />
                <path d="M0 98 C80 96 140 84 220 82 C300 80 380 66 460 60 C510 56 540 52 560 48" fill="none" stroke="#8FA39A" strokeWidth="1.5" strokeDasharray="4 4" opacity="0.5" />
              </svg>
            </div>
            {/* expense rows */}
            <div className="mt-3 flex flex-col divide-y divide-line-dark rounded-lg border border-line-dark bg-ink-800">
              {ROW_MOCKS.map((row) => (
                <div key={row.desc} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-text-dark-100">{row.desc}</p>
                    <p className="font-mono text-[10px] tabular text-text-dark-400">{row.date}</p>
                  </div>
                  <span className="font-mono text-xs font-medium tabular text-text-dark-100">{row.value}</span>
                  <ConfidenceBadge level={row.level} variant="outline" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      {/* floating notification card */}
      <div className="hero-notif absolute -right-4 top-16 hidden items-center gap-2.5 rounded-xl border border-line-dark bg-ink-800/95 px-4 py-3 shadow-xl backdrop-blur md:flex">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-conf-alta-bg">
          <CheckCircle2 className="h-4 w-4 text-conf-alta-text" />
        </span>
        <div>
          <p className="text-xs font-semibold text-text-dark-100">OCR concluído</p>
          <p className="font-mono text-[10px] tabular text-text-dark-400">14 campos extraídos</p>
        </div>
      </div>
    </div>
  )
}

export default function Hero() {
  const root = useRef<HTMLElement>(null)
  const underline = useRef<SVGPathElement>(null)

  useGSAP(
    () => {
      const split = new SplitText(".hero-h1", { type: "words" })
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } })
      tl.fromTo(".hero-eyebrow", { opacity: 0 }, { opacity: 1, duration: 0.4 }, 0)
        .fromTo(
          split.words,
          { y: 30, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.6, stagger: 0.045 },
          0.15,
        )
        .fromTo(
          underline.current,
          { strokeDashoffset: 1 },
          { strokeDashoffset: 0, duration: 0.7, ease: "power2.inOut" },
          0.8,
        )
        .fromTo(".hero-sub", { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4 }, 1.0)
        .fromTo(".hero-cta", { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, stagger: 0.1 }, 1.15)
        .fromTo(".hero-trust", { opacity: 0 }, { opacity: 1, duration: 0.3 }, 1.4)
        .fromTo(
          ".hero-mock-inner",
          { y: 80, opacity: 0, rotateX: 18 },
          { y: 0, opacity: 1, rotateX: 8, duration: 0.9, ease: "power2.out" },
          1.5,
        )
        .fromTo(".hero-notif", { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.4 }, 2.1)
        .fromTo(".hero-annotation", { opacity: 0 }, { opacity: 0.4, duration: 0.5, stagger: 0.15 }, 2.0)
        // Criar conta pulses once after the headline finishes
        .fromTo(
          "#navbar-cta",
          { boxShadow: "0 0 0 0 rgba(43,224,140,0)" },
          { boxShadow: "0 0 0 8px rgba(43,224,140,0.3)", duration: 0.4, yoyo: true, repeat: 1, ease: "power2.out" },
          1.1,
        )

      // scroll parallax: text up at 0.4x, mock at 0.15x, fade out by 70% viewport
      gsap.to(".hero-content", {
        yPercent: -40,
        opacity: 0,
        ease: "none",
        scrollTrigger: { trigger: root.current, start: "top top", end: "70% top", scrub: true },
      })
      gsap.to(".hero-mock", {
        yPercent: -15,
        opacity: 0,
        ease: "none",
        scrollTrigger: { trigger: root.current, start: "top top", end: "70% top", scrub: true },
      })

      return () => split.revert()
    },
    { scope: root },
  )

  return (
    <section
      ref={root}
      className="hero-glow relative flex min-h-[100dvh] min-h-[720px] flex-col items-center overflow-hidden bg-ink-950 px-6 pb-24 pt-40"
    >
      <div className="bg-dotted-grid-dark pointer-events-none absolute inset-0" aria-hidden />
      {ANNOTATIONS.map((a) => (
        <span
          key={a.text}
          className={`hero-annotation animate-float-y pointer-events-none absolute hidden font-mono text-[11px] tracking-[0.02em] text-text-dark-400 opacity-0 will-change-transform lg:block ${a.className}`}
          style={{ animationDelay: a.delay }}
        >
          {a.text}
        </span>
      ))}

      <div className="hero-content relative z-10 flex max-w-[880px] flex-col items-center text-center">
        <span className="hero-eyebrow inline-flex items-center gap-2 rounded-full border border-brand-400/30 px-3 py-1 font-mono text-[11px] tracking-[0.04em] text-brand-400 opacity-0">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-400" />
          MOTOR DE RECUPERAÇÃO TRIBUTÁRIA · v1.1
        </span>

        <h1 className="hero-h1 mt-6 font-display text-[clamp(44px,6.5vw,84px)] font-semibold leading-[1.02] tracking-[-0.03em] text-text-dark-100">
          Sua empresa paga{" "}
          <span className="relative whitespace-nowrap text-brand-400">
            tributo a mais
            <svg
              className="absolute -bottom-2 left-0 h-3 w-full"
              viewBox="0 0 300 12"
              fill="none"
              preserveAspectRatio="none"
              aria-hidden
            >
              <path
                ref={underline}
                d="M3 9 C 60 3, 120 10, 180 6 S 270 4, 297 7"
                stroke="#2BE08C"
                strokeWidth="3"
                strokeLinecap="round"
                pathLength={1}
                style={{ strokeDasharray: 1, strokeDashoffset: 1 }}
              />
            </svg>
          </span>
          . A gente encontra onde.
        </h1>

        <p className="hero-sub mt-6 max-w-[640px] text-[17px] leading-[1.6] text-text-dark-400 opacity-0">
          Envie a nota fiscal. Nosso OCR extrai os dados, o motor classifica a elegibilidade por CNAE × regime
          tributário e quantifica cada centavo recuperável — PIS/COFINS, ICMS, CBS/IBS, IRPJ e CSLL. Com trilha de
          auditoria.
        </p>

        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
          <Link
            to="/cadastro"
            className="hero-cta inline-flex h-[52px] items-center gap-2 rounded-[10px] bg-brand-500 px-7 text-[15px] font-semibold text-white opacity-0 transition hover:scale-[1.03] hover:bg-brand-500/90 hover:ring-4 hover:ring-brand-400/25"
          >
            Criar conta grátis
            <ArrowRight className="h-4 w-4" />
          </Link>
          <a
            href="#como-funciona"
            className="hero-cta inline-flex h-[52px] items-center gap-2 rounded-[10px] border border-line-dark px-7 text-[15px] font-semibold text-text-dark-100 opacity-0 transition hover:border-brand-400/60"
          >
            <Play className="h-4 w-4" />
            Ver como funciona
          </a>
        </div>

        <p className="hero-trust mt-6 font-mono text-xs tracking-[0.02em] text-text-dark-400 opacity-0">
          ✓ Banco de dados na plataforma — nada para instalar&nbsp;&nbsp;·&nbsp;&nbsp;✓ Login próprio, seus dados
          isolados&nbsp;&nbsp;·&nbsp;&nbsp;✓ Regras com base legal versionada
        </p>
      </div>

      <div className="relative z-10 mt-16 w-full">
        <HeroMock />
      </div>
    </section>
  )
}

import { useEffect, useRef, useState } from "react"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { SplitText } from "gsap/SplitText"
import { useGSAP } from "@gsap/react"
import { Link } from "react-router"
import { Check } from "lucide-react"
import { Area, AreaChart, Cell, Pie, PieChart, ResponsiveContainer } from "recharts"

gsap.registerPlugin(ScrollTrigger, SplitText, useGSAP)

const BULLETS = [
  { title: "Identificado", text: "potencial total detectado nas notas" },
  { title: "Capturável", text: "já classificado em Alta confiança, pronto para recuperar" },
  { title: "Em revisão", text: "Média confiança aguardando validação humana" },
  { title: "Pendências", text: "cadastro incompleto, evidência faltando, consumo divergente" },
]

const CHART_DATA = [
  { m: "jan", combustivel: 4200, alimentacao: 1400, hospedagem: 900 },
  { m: "fev", combustivel: 5100, alimentacao: 1600, hospedagem: 1100 },
  { m: "mar", combustivel: 6800, alimentacao: 1300, hospedagem: 1400 },
  { m: "abr", combustivel: 7400, alimentacao: 1900, hospedagem: 1200 },
  { m: "mai", combustivel: 9100, alimentacao: 1700, hospedagem: 1800 },
  { m: "jun", combustivel: 10400, alimentacao: 2200, hospedagem: 1600 },
]

const DONUT_DATA = [
  { name: "Alta", value: 66, color: "#0EA968" },
  { name: "Média", value: 21, color: "#D97706" },
  { name: "Baixa", value: 9, color: "#EA580C" },
  { name: "Vedado", value: 4, color: "#DC2626" },
]

const KPIS = [
  { caption: "Identificado", value: 48210.35 },
  { caption: "Capturável", value: 31904.12 },
  { caption: "Em revisão", value: 7118.6 },
]

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })

function useInView(ref: React.RefObject<Element | null>) {
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => entry.isIntersecting && setInView(true),
      { threshold: 0.25 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [ref])
  return inView
}

function CountUp({ value, active }: { value: number; active: boolean }) {
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    if (!active) return
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 1200)
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(value * eased)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [active, value])
  return <>{brl.format(display)}</>
}

function LightMock({ active }: { active: boolean }) {
  return (
    <div className="w-full overflow-hidden rounded-2xl bg-surface shadow-[0_40px_90px_-30px_rgba(0,0,0,0.8)] ring-1 ring-line">
      <div className="flex h-9 items-center gap-2 border-b border-line bg-paper px-4">
        <span className="h-2 w-2 rounded-full bg-line" />
        <span className="h-2 w-2 rounded-full bg-line" />
        <span className="ml-2 font-mono text-[10px] text-text-500">app.reembolsa.ia/dashboard</span>
      </div>
      <div className="p-5">
        <div className="grid grid-cols-3 gap-3">
          {KPIS.map((kpi) => (
            <div key={kpi.caption} className="rounded-xl border border-line bg-surface p-3.5 shadow-card">
              <p className="text-[10px] font-medium uppercase tracking-[0.05em] text-text-500">{kpi.caption}</p>
              <p className="mt-1 font-mono text-sm font-semibold tabular text-text-900 sm:text-base">
                <CountUp value={kpi.value} active={active} />
              </p>
            </div>
          ))}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_190px]">
          <div className="rounded-xl border border-line bg-surface p-3.5 shadow-card">
            <p className="text-[10px] font-medium uppercase tracking-[0.05em] text-text-500">Evolução por categoria</p>
            <div className="mt-1 h-36">
              {active && (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={CHART_DATA} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
                    <Area type="monotone" dataKey="combustivel" stackId="1" stroke="#0EA968" fill="#0EA968" fillOpacity={0.25} strokeWidth={2} animationDuration={1200} />
                    <Area type="monotone" dataKey="alimentacao" stackId="1" stroke="#D97706" fill="#D97706" fillOpacity={0.25} strokeWidth={2} animationDuration={1200} />
                    <Area type="monotone" dataKey="hospedagem" stackId="1" stroke="#2563EB" fill="#2563EB" fillOpacity={0.25} strokeWidth={2} animationDuration={1200} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
          <div className="flex flex-col rounded-xl border border-line bg-surface p-3.5 shadow-card">
            <p className="text-[10px] font-medium uppercase tracking-[0.05em] text-text-500">Por confiança</p>
            <div className="relative mx-auto mt-1 h-28 w-28">
              {active && (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={DONUT_DATA} dataKey="value" innerRadius={32} outerRadius={52} strokeWidth={0} animationDuration={900}>
                      {DONUT_DATA.map((d) => (
                        <Cell key={d.name} fill={d.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="mt-1 flex flex-col gap-1">
              {DONUT_DATA.map((d) => (
                <span key={d.name} className="flex items-center gap-1.5 text-[10px] text-text-500">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: d.color }} />
                  {d.name} <span className="ml-auto font-mono tabular">{d.value}%</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function DashboardPreview() {
  const root = useRef<HTMLElement>(null)
  const mockRef = useRef<HTMLDivElement>(null)
  const inView = useInView(mockRef)

  useGSAP(
    () => {
      const split = new SplitText(".preview-h2", { type: "words" })
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
        ".preview-bullet",
        { y: 20, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.45,
          stagger: 0.09,
          ease: "power3.out",
          scrollTrigger: { trigger: ".preview-bullets", start: "top 80%" },
        },
      )
      gsap.fromTo(
        ".preview-mock",
        { x: 60, opacity: 0, rotateY: -6 },
        {
          x: 0,
          opacity: 1,
          rotateY: 0,
          duration: 0.8,
          ease: "power3.out",
          scrollTrigger: { trigger: ".preview-mock", start: "top 70%" },
        },
      )
      return () => split.revert()
    },
    { scope: root },
  )

  return (
    <section ref={root} className="bg-ink-950 py-24">
      <div className="mx-auto grid max-w-[1200px] items-center gap-12 px-6 lg:grid-cols-2">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.06em] text-brand-400">Visão executiva</p>
          <h2 className="preview-h2 mt-3 font-display text-[clamp(30px,4vw,48px)] font-semibold leading-[1.08] tracking-[-0.02em] text-text-dark-100">
            Identificado ≠ capturável. Você enxerga os três.
          </h2>
          <ul className="preview-bullets mt-8 flex flex-col gap-4">
            {BULLETS.map((b) => (
              <li key={b.title} className="preview-bullet flex items-start gap-3 opacity-0">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-conf-alta-bg">
                  <Check className="h-3 w-3 text-conf-alta-text" />
                </span>
                <p className="text-[15px] leading-relaxed text-text-dark-400">
                  <strong className="font-semibold text-text-dark-100">{b.title}</strong> — {b.text}
                </p>
              </li>
            ))}
          </ul>
          <Link
            to="/cadastro"
            className="mt-8 inline-flex h-11 items-center rounded-[10px] border border-line-dark px-5 text-sm font-semibold text-text-dark-100 transition-colors hover:border-brand-400/60 hover:text-brand-400"
          >
            Explorar o dashboard →
          </Link>
        </div>
        <div ref={mockRef} style={{ perspective: "1200px" }}>
          <div className="preview-mock opacity-0" style={{ transformStyle: "preserve-3d" }}>
            <LightMock active={inView} />
          </div>
        </div>
      </div>
    </section>
  )
}

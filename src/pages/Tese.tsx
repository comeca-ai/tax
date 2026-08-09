import { useEffect } from "react"
import { Link } from "react-router"
import { motion } from "framer-motion"
import { ArrowRight, Scale, XCircle } from "lucide-react"

const EASE = [0.16, 1, 0.3, 1] as [number, number, number, number]

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.08 * i, duration: 0.55, ease: EASE },
  }),
}

const NUMEROS = [
  {
    valor: "9,25%",
    texto: "PIS/COFINS sobre os insumos da atividade (não-cumulatividade)",
  },
  {
    valor: "ad rem",
    texto: "ICMS por litro de combustível, conforme a UF",
  },
  {
    valor: "34%",
    texto: "IRPJ + CSLL: dedução das despesas operacionais",
  },
]

const GLOSAS = [
  {
    glosa: "“Essa despesa existiu de verdade?”",
    defesa:
      "Só confirmamos crédito com documento anexado. Sem evidência, a despesa fica na fila de revisão — nunca entra no relatório como confirmada.",
  },
  {
    glosa: "“Tem relação com a atividade tributada?”",
    defesa:
      "A matriz cruza CNAE × categoria × regime tributário e classifica cada despesa em alta, média, baixa confiança — ou vedada. E do uso misto, só creditamos a parte comercial: valor fiscal ≠ valor do reembolso.",
  },
  {
    glosa: "“O valor é plausível?”",
    defesa:
      "Por isso pedimos o veículo. O motor cruza km rodados × litros consumidos, com tolerância de 15%: 200 litros de diesel sem km compatível não passam.",
  },
  {
    glosa: "“Como chegaram nesse número?”",
    defesa:
      "Cada despesa tem memorial de cálculo com fórmula, base legal e versão da regra vigente na data do fato — e um log de auditoria imutável que reconstrói cada decisão.",
  },
]

const NUNCA = [
  "Nunca soma crédito com dedutibilidade — trilhas paralelas, sempre.",
  "Nunca aprova despesa sem evidência documental.",
  "Nunca credita a parte pessoal do uso do veículo.",
  "Nunca aplica regra de hoje em fato de ontem — a regra vale pela data do fato.",
]

function DividerGlow() {
  return <div className="divider-glow mx-auto h-px max-w-[1200px]" aria-hidden />
}

/** Página pública "A Tese" — por que cada decisão de produto existe para defender o crédito. */
export default function Tese() {
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  return (
    <>
      {/* 1 · Hero */}
      <section className="hero-glow relative overflow-hidden bg-ink-950 px-6 pb-20 pt-40">
        <div className="bg-dotted-grid-dark pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative z-10 mx-auto flex max-w-[880px] flex-col items-center text-center">
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="inline-flex items-center gap-2 rounded-full border border-brand-400/30 px-3 py-1 font-mono text-[11px] tracking-[0.04em] text-brand-400"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-brand-400" />
            A TESE · POR QUE CADA DADO IMPORTA
          </motion.span>
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.6, ease: EASE }}
            className="mt-6 font-display text-[clamp(36px,5vw,64px)] font-semibold leading-[1.05] tracking-[-0.03em] text-text-dark-100"
          >
            Cada campo que a gente pede é uma defesa do seu crédito.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.5, ease: EASE }}
            className="mt-6 max-w-[680px] text-[16px] leading-[1.6] text-text-dark-400"
          >
            O reembolsa.ia recupera tributos que sua empresa já pagou — e cada decisão de produto
            existe para o crédito se sustentar se a Receita perguntar. Esta página explica o porquê,
            em linguagem simples.
          </motion.p>
        </div>
      </section>

      {/* 2 · A tese em números */}
      <section className="bg-ink-950 px-6 py-24">
        <div className="mx-auto max-w-[1200px]">
          <div className="grid gap-4 md:grid-cols-3">
            {NUMEROS.map((n, i) => (
              <motion.article
                key={n.valor}
                custom={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-80px" }}
                variants={fadeUp}
                className="rounded-2xl border border-line-dark bg-ink-800 p-7 transition-colors duration-200 hover:border-brand-400/40"
              >
                <p className="font-mono text-[32px] font-semibold leading-none tracking-[-0.01em] tabular text-brand-400">
                  {n.valor}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-text-dark-400">{n.texto}</p>
              </motion.article>
            ))}
          </div>
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="mt-6 text-center font-mono text-[11px] tracking-[0.02em] text-text-dark-400"
          >
            Crédito e dedutibilidade são trilhas paralelas — apuradas em separado, nunca somadas.
          </motion.p>
        </div>
      </section>

      <DividerGlow />

      {/* 3 · O que a Receita questiona */}
      <section className="bg-ink-950 px-6 py-24">
        <div className="mx-auto max-w-[1200px]">
          <motion.h2
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={fadeUp}
            className="max-w-2xl font-display text-[clamp(30px,4vw,48px)] font-semibold leading-[1.08] tracking-[-0.02em] text-text-dark-100"
          >
            O que a Receita questiona
          </motion.h2>
          <div className="mt-12 flex flex-col gap-5">
            {GLOSAS.map((g, i) => (
              <motion.div
                key={g.glosa}
                custom={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-60px" }}
                variants={fadeUp}
                className="grid items-stretch gap-3 md:grid-cols-[1fr_auto_1.6fr]"
              >
                <div className="rounded-2xl border border-red-500/25 bg-red-500/5 p-6">
                  <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-red-500/80">
                    A glosa
                  </span>
                  <p className="mt-2 font-display text-lg font-medium tracking-[-0.01em] text-text-dark-100">
                    {g.glosa}
                  </p>
                </div>
                <span className="flex items-center justify-center text-brand-400" aria-hidden>
                  <ArrowRight className="h-5 w-5 rotate-90 md:rotate-0" />
                </span>
                <div className="rounded-2xl border border-brand-400/25 bg-brand-400/5 p-6">
                  <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-brand-400">
                    A defesa do produto
                  </span>
                  <p className="mt-2 text-sm leading-relaxed text-text-dark-100">{g.defesa}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <DividerGlow />

      {/* 4 · O que o reembolsa.ia nunca faz */}
      <section className="bg-ink-950 px-6 py-24">
        <div className="mx-auto max-w-[1200px]">
          <motion.h2
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={fadeUp}
            className="max-w-2xl font-display text-[clamp(30px,4vw,48px)] font-semibold leading-[1.08] tracking-[-0.02em] text-text-dark-100"
          >
            O que o reembolsa.ia nunca faz
          </motion.h2>
          <div className="mt-12 grid gap-4 md:grid-cols-2">
            {NUNCA.map((texto, i) => (
              <motion.div
                key={texto}
                custom={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-60px" }}
                variants={fadeUp}
                className="flex items-start gap-3.5 rounded-2xl border border-line-dark bg-ink-800 p-6 transition-colors duration-200 hover:border-red-500/40"
              >
                <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500/60" />
                <p className="text-[15px] leading-relaxed text-text-dark-100">{texto}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <DividerGlow />

      {/* 5 · Para o seu contador */}
      <section className="bg-ink-950 px-6 py-24">
        <div className="mx-auto max-w-[880px]">
          <motion.article
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={fadeUp}
            className="rounded-2xl border border-brand-400/25 bg-ink-800 p-8 sm:p-10"
          >
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand-400/10 ring-1 ring-brand-400/25">
              <Scale className="h-5 w-5 text-brand-400" />
            </span>
            <h2 className="mt-5 font-mono text-[12px] font-semibold tracking-[0.08em] text-brand-400">
              PARA O SEU CONTADOR
            </h2>
            <p className="mt-5 font-mono text-[12.5px] leading-[1.7] tracking-[0.01em] text-text-dark-100">
              <span className="font-semibold text-brand-400">Metodologia:</span> apuração assistida
              com memorial de cálculo por despesa, classificação de confiança e trilha de auditoria
              completa — pronta para revisão e assinatura do responsável técnico.
            </p>
            <div className="my-5 border-t border-dashed border-line-dark" aria-hidden />
            <p className="font-mono text-[12.5px] leading-[1.7] tracking-[0.01em] text-text-dark-100">
              <span className="font-semibold text-brand-400">Referências:</span> não-cumulatividade
              do PIS/COFINS (Leis nº 10.637/2002 e 10.833/2003); créditos sobre insumos conforme IN
              RFB nº 1.911/2019; ICMS ad rem sobre combustíveis, por UF; transição CBS/IBS (LC nº
              224/2025) e versionamento regulatório (ex.: MP nº 1.340/2026); segregação de uso misto
              documentada por quilometragem.
            </p>
            <div className="mt-6 flex items-start gap-2 rounded-xl border border-conf-media-dot/20 bg-conf-media-dot/5 px-4 py-3">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-conf-media-dot" aria-hidden />
              <p className="font-mono text-[11px] leading-[1.6] tracking-[0.02em] text-conf-media-dot">
                O reembolsa.ia não substitui o aconselhamento tributário — os créditos apurados
                devem ser validados pelo contador antes da compensação.
              </p>
            </div>
          </motion.article>
        </div>
      </section>

      {/* 6 · CTA final (padrão CtaBand) */}
      <section className="bg-ink-950 px-6 pb-24 pt-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease: EASE }}
          className="relative mx-auto flex max-w-[1200px] flex-col items-center overflow-hidden rounded-3xl px-6 py-20 text-center"
          style={{ background: "linear-gradient(135deg, #0B3D2A, #070B09)" }}
        >
          <div className="bg-dotted-grid-dark pointer-events-none absolute inset-0" aria-hidden />
          <h2 className="relative font-display text-[clamp(30px,4vw,48px)] font-semibold tracking-[-0.02em] text-text-dark-100">
            Recupere com defesa, não com esperança.
          </h2>
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
        </motion.div>
      </section>
    </>
  )
}

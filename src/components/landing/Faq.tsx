import { motion } from "framer-motion"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"

const ITEMS = [
  {
    q: "Preciso instalar algo ou contratar servidor?",
    a: "Não. O banco de dados é provisionado automaticamente pela plataforma no seu cadastro. Você só precisa de e-mail e senha para entrar.",
  },
  {
    q: "Como funciona o OCR das despesas?",
    a: "Você sobe a foto ou PDF da nota na plataforma. O OCR extrai CNPJ, CFOP, NCM, CST, valores, data e litros. Cada campo mostra a confiança da extração — se algo vier ilegível, você revisa com preenchimento assistido antes de processar.",
  },
  {
    q: "O sistema garante o crédito?",
    a: "Não. Classificamos elegibilidade com níveis de confiança explícitos. Classificações de média confiança exigem documento de suporte e validação humana — recomendamos revisão de um advogado tributarista.",
  },
  {
    q: "Posso gerenciar mais de uma empresa?",
    a: "Sim. Uma conta gerencia várias empresas (tenants), cada uma com CNAEs, regime, UF, despesas e relatórios isolados. Troque de empresa no seletor do topo.",
  },
  {
    q: "E quando a lei mudar?",
    a: "As regras são versionadas com vigência até 2033. O motor aplica a regra vigente na data do fato gerador de cada nota — inclusive retroativamente.",
  },
  {
    q: "Quais regimes tributários são atendidos?",
    a: "Lucro Real, Lucro Presumido e Simples Nacional. A elegibilidade muda conforme o regime — por isso o cadastro da empresa é obrigatório antes de processar créditos.",
  },
]

export default function Faq() {
  return (
    <section id="faq" className="bg-ink-950 py-24">
      <div className="mx-auto grid max-w-[1200px] gap-12 px-6 lg:grid-cols-[1fr_1.4fr]">
        <div>
          <h2 className="font-display text-[clamp(30px,4vw,48px)] font-semibold leading-[1.08] tracking-[-0.02em] text-text-dark-100">
            Perguntas frequentes
          </h2>
          <p className="mt-4 max-w-sm text-[15px] leading-[1.6] text-text-dark-400">
            Não achou sua dúvida? Fale com a gente pelo suporte dentro da plataforma — respondemos em horário
            comercial.
          </p>
        </div>
        <div>
          <Accordion type="single" collapsible className="w-full">
            {ITEMS.map((item, i) => (
              <motion.div
                key={item.q}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ delay: 0.07 * i, duration: 0.4, ease: "easeOut" }}
              >
                <AccordionItem value={`item-${i}`} className="border-line-dark">
                  <AccordionTrigger className="text-left text-[15px] font-medium text-text-dark-100 hover:text-brand-400 hover:no-underline">
                    {item.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm leading-relaxed text-text-dark-400">
                    {item.a}
                  </AccordionContent>
                </AccordionItem>
              </motion.div>
            ))}
          </Accordion>
        </div>
      </div>
      <div className="mx-auto mt-16 max-w-[1200px] px-6">
        <p className="border-t border-line-dark pt-6 font-mono text-[11px] leading-relaxed tracking-[0.02em] text-text-dark-400">
          reembolsa.ia é uma ferramenta de apoio à recuperação de créditos tributários e não presta aconselhamento
          jurídico, contábil ou fiscal. Classificações de média confiança devem ser validadas por um advogado
          tributarista antes de qualquer aproveitamento de crédito. As regras aplicadas são versionadas com base legal
          e vigência explícitas; a responsabilidade final pela escrituração permanece com o contribuinte e seus
          assessores.
        </p>
      </div>
    </section>
  )
}

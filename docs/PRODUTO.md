# reembolsa.ia — Visão de Produto, Fluxos e Processos

> Documento vivo de produto. Origem: sessão de redesenho de agosto/2026.
> Status: **proposta de direção** — ainda não é especificação de implementação.

---

## 1. O que o produto é

**Um agente de reembolso.** Não uma plataforma de módulos, não um ERP de despesas.

O funcionário manda a foto do cupom no WhatsApp. O agente — treinado pela política de
reembolso da empresa — aprova, reprova ou pede o que falta. No fim do mês, o admin aperta
um botão e um dossiê completo de recuperação fiscal vai para o contador.

O app web existe, mas como **back office**: política, pessoas, exceções, dossiê.
O funcionário idealmente nunca o abre.

### O que o produto NÃO é

- **Não entra na parte fiscal.** O produto monta e defende o dossiê; quem decide,
  escritura e assina é o contador. Isso nos mantém fora do território regulado e
  transforma o contador em canal, não em concorrente.
- **Não é caixa-preta.** Toda decisão do agente cita a regra da política que a fundamenta.
  Nada de "o sistema aprendeu" — a inteligência mora no documento escrito.

---

## 2. Princípios

1. **Cada campo que a gente pede é uma defesa.**
   Se o dado não defende aquele caso de reembolso, ele não é pedido naquele caso.
   Pedir veículo para quem quer reembolso de almoço é UX ruim e ruído no dossiê.

2. **O fim do achismo.**
   Aprovação não pode depender de humor, relacionamento ou dia do mês. Regra escrita +
   agente aplicando = o fim do "achou ou não". Efeito colateral: o funcionário sabe
   *antes de gastar* o que passa.

3. **Gestão por exceção.**
   O humano só é chamado quando há decisão real. O melhor dia do admin é o dia em que
   ele não abre o painel. Métrica de UX do admin: **minutos por mês**, não engajamento.

4. **A política é a única fonte de verdade — e o sistema nunca a toca.**
   O que não está na política não existe como regra — e nada é aprovado fora dela.
   Dúvidas materiais (imagem ilegível, dado inconsistente) vão para revisão manual
   do gestor. O sistema **não sugere nem acrescenta nada** na política: ela só muda
   por decisão humana, editando o documento. A inteligência do sistema mora no
   documento; o agente é o executor incansável e sem humor do que está escrito.

5. **O interesse do funcionário é o motor.**
   Ele não preenche cadastro para ajudar a empresa — ele destrava o dinheiro *dele*.
   Todo fluxo de adesão usa essa motivação, não cobrança do admin.

---

## 3. Atores

| Ator | Interface | Trabalho | Carga alvo |
|------|-----------|----------|-----------|
| **Funcionário** | WhatsApp | Confirmar dados, mandar despesas, responder o agente | Segundos por despesa |
| **Superior direto / gestor** | WhatsApp / link | Revisão manual: dúvidas de imagem e casos sem cobertura na política | Alguns itens por mês |
| **Admin** | Web (back office) | Subir planilha, manter política, decidir exceções, gerar dossiê | Minutos por mês |
| **Contador** | Recebe o kit | Conferir e lançar | Só conferência |
| **Agente** | — | Confirmar, coletar, aplicar a política, escalar, montar dossiê | Tudo o resto |

**Hierarquia de UX (cada degrau mais leve que o anterior):**
Funcionário: conversa → Superior: fila de decisões → Admin: caixa de entrada de exceções
→ Contador: pacote pronto.

---

## 4. Fluxos

### 4.1 Setup da empresa (uma vez)

1. Admin cria a empresa (CNPJ → dados via ReceitaWS, já existe).
2. Admin sobe a **política de reembolso** (PDF/texto — parser já existe, v1.4.3).
   O sistema extrai tetos, exigências, km, e mostra o que ficou pendente.
3. Admin sobe a **planilha de funcionários** (upload em lote — CSV/Excel que o DP já tem).
   Mínimo: nome, telefone, matrícula. Desejável: e-mail, centro de custo, matrícula do
   superior (define quem recebe a revisão manual).
4. Sistema valida em lote (telefone inválido, matrícula duplicada) e mostra resumo
   antes de disparar convites.

### 4.2 Convite e ativação (por funcionário)

1. Funcionário recebe **e-mail**: "A [Empresa] cadastrou você no reembolso. Para ativar
   e começar a receber, chama aqui." — link `wa.me` com mensagem pré-preenchida
   (identificação por matrícula/token).
2. **O funcionário inicia a conversa** — decisão deliberada: o funcionário vem até o
   agente. Na API oficial da Meta isso abre a janela de atendimento sem cobrança de
   template; na largada (Evolution API) é simplesmente a melhor UX.
   O e-mail é só o isqueiro; lembretes de não-ativados seguem por e-mail (centavos).
3. Primeira conversa = **confirmação, não cadastro**:
   - "Cadastramos você assim: João Silva, matrícula 1234, joao@... Confere?"
   - Dado errado ou faltante (telefone, e-mail): o próprio funcionário corrige.
     Divergência relevante sobe como exceção para o admin aceitar.
4. **Declaração de perfil de despesa** (3 perguntas, 10 segundos, tom de conversa):
   "Roda com carro próprio? Viaja? Faz refeição com cliente?"
   → O sistema monta o checklist *daquela pessoa*. Quem marcou combustível recebe o
   pedido do veículo **na hora** (foto do documento pelo WhatsApp). Quem não marcou
   nunca vê essa tela.
5. A declaração não é contrato: se um dia chegar despesa de combustível de quem não
   declarou, o agente corrige a rota ali mesmo: "para defender esse reembolso preciso
   do veículo — cadastra rapidinho?"

**Regra estrutural:** sem onboarding concluído, não existe despesa. O onboarding é o
portão único — elimina o estado "despesa órfã de usuário inativo".

**Painel do admin durante ativação:** resumo, não operação.
"87 convidados · 82 confirmaram · 4 pendentes · 1 divergência de dado (aceita?)"

**Transporte WhatsApp (decisão de largada, 12/08/2026):** usamos **Evolution API**
(self-hosted, container na VPS) no piloto e nas primeiras empresas — zero burocracia
Meta, custo zero por mensagem, velocidade de validação. Risco conhecido e aceito:
API não-oficial (risco de banimento do número e instabilidade de protocolo) —
mitigado por número dedicado, volume baixo e conversas iniciadas pelo funcionário.
A camada de transporte é isolada atrás de `WHATSAPP_PROVIDER=evolution|meta`:
quando fizer sentido (escala), migramos para a Cloud API oficial **sem mudar o
produto** — sessões, máquina de estados e decisor permanecem idênticos.

### 4.3 Ciclo de uma despesa

1. Funcionário manda a foto (cupom/nota) no WhatsApp.
2. Agente processa (OCR/visão) e pergunta **só o que defende aquele caso**:
   - Almoço: "foi com cliente? comprovante de pagamento?"
   - Combustível: veículo já cadastrado + km (origem/destino ou odômetro).
   - Nunca: formulário completo para todo mundo.
3. Agente consulta a política e decide:

| Situação | Decisão | Experiência |
|----------|---------|-------------|
| Dentro da política (regra explícita) | **Aprova na hora** | "Aprovado: R$ 42,00" — segundos, não semanas |
| Fora da política (ou sem regra que autorize) | **Reprova citando a regra** | "Sua política limita alimentação a R$ 55 — essa nota é R$ 80" |
| Dúvida material (imagem ilegível, dado inconsistente) | **Revisão manual do gestor** | Vai para a fila de revisão, com o dossiê do item |

**Não existe zona cinzenta de decisão.** Nada é aprovado que não conste na política.
A revisão manual existe para o gestor resolver *dúvidas sobre a evidência*, não para
criar exceções à política.

4. **Retroatividade:** definida pela política da empresa, não pelo produto.
   "Aceita despesas de até 60 dias" é regra do documento; o agente aplica e cita.
   Fora do prazo: reprova, com opção de registrar como exceção para o aprovador decidir.

5. Toda decisão do agente **cita a regra aplicada**. Reprovação com fundamento não gera
   briga; arbitrariedade gera.

### 4.4 Revisão manual — e por que não existe zona cinzenta

1. O agente só tem três saídas: **aprova citando a regra**, **reprova citando a
   regra**, ou **devolve para revisão manual** quando a *evidência* não permite
   concluir (imagem ilegível, dado inconsistente, comprovante suspeito, caso sem
   cobertura na política).
2. Revisão vai para o **gestor** (superior direto; sem superior cadastrado → admin;
   sem admin separado → quem paga). Ele decide com contexto: nota, regra aplicável,
   histórico do funcionário.
3. **O gestor decide com base na política — ela é o limite dele também.** Se a
   política não cobre o caso, o correto é não aprovar e, se a empresa quiser,
   **alguém edita a política por fora** — a decisão seguinte já encontra a regra
   escrita. O sistema **não sugere nem acrescenta nada** no documento.
4. **Nada de aprendizado, implícito ou explícito.** Decisões humanas não viram viés
   do agente nem texto automático na política. O documento só muda por edição humana
   versionada — contador, auditor e fiscal leem exatamente o que vigorava.

**Volume esperado:** com política boa, a revisão manual é pequena (~poucos % do
volume) — a maioria é evidência ruim, não dúvida de regra.

### 4.5 Fechamento do mês → dossiê → contador

1. Admin abre o painel: "Mês fechado: 87 funcionários, 812 despesas, 98% aprovadas
   automaticamente, 5 exceções resolvidas."
2. Aperta o botão: **gerar dossiê do contador**.
3. Saída: **kit .zip de recuperação fiscal** — não um zip de fotos jogadas. Cada despesa
   carrega os elementos de defesa:
   - o documento fiscal (nota/cupom),
   - a evidência contextual (o que prova que a despesa aconteceu e foi paga),
   - dados do veículo e quilometragem (quando combustível),
   - motivo da despesa amarrado à atividade,
   - a regra da política que autorizou, com o teto aplicado,
   - a trilha: quem enviou, quando, quem aprovou (ou qual regra auto-aprovou).
4. O contador recebe o pacote pronto, confere e lança. **O produto entrega a defesa;
   a decisão fiscal é dele.**

Formato de entrega do kit (a definir na arquitetura): download do zip, link temporário,
ou login de contador. Decisão de produto em aberto: contador é **destinatário** ou
**usuário**? (Se um escritório atender várias empresas, há um segundo produto possível:
o painel do escritório. Fora do escopo atual.)

### 4.6 Admin como usuário de exceção

O admin também opera por **push**: em vez de lembrar de abrir o painel, ele é avisado
(e-mail/WhatsApp) quando há decisão pendente, com link direto. O painel é uma
**caixa de entrada**: 3 pessoas sem ativar → reenviar lembrete; 5 itens em revisão
→ decidir; mês fechado → gerar dossiê. Caixa vazia = está tudo bem.

Três atos mensais do admin, no máximo: subir/atualizar algo quando muda, decidir
exceções, apertar o botão do dossiê.

---

## 5. Regras de negócio (resumo normativo)

1. Sem onboarding concluído, não há despesa.
2. O admin cadastra o que é da empresa (matrícula, cargo, centro de custo, hierarquia);
   o funcionário confirma/completa o que é dele (telefone, e-mail, veículo).
3. O agente só pede o dado que defende a despesa em questão — contextual, por caso.
4. Toda decisão automática cita a regra da política.
5. Nenhum reembolso é aprovado sem regra explícita na política — não existe zona
   cinzenta de decisão.
6. Dúvida material (imagem, inconsistência, caso sem cobertura) vai para revisão
   manual do gestor. O sistema nunca sugere nem acrescenta nada na política — ela
   só muda por edição humana.
7. Retroatividade, tetos e exigências vêm da política da empresa — nunca de defaults
   escondidos do produto.
8. O dossiê é o produto final: cada item entregue é uma defesa completa, não um anexo.
9. O produto não escritura, não lança, não opina em tributo: prepara e defende;
   o contador decide e assina.

---

## 6. O que já existe (v1.4.x) vs. o que falta

| Capacidade | Status |
|---|---|
| Empresas, CNPJ→ReceitaWS, primeiro usuário vira admin | ✅ existe |
| Convites por e-mail (token, aceite via link) | ✅ existe (v1.2.0) |
| Política: upload + parser (tetos, exigências, km, pendências) | ✅ existe (v1.4.3) |
| Despesas, evidências, veículos, aprovação manual no app | ✅ existe |
| Dossiê/relatório de fechamento | 🟡 parcial |
| **Upload em lote de funcionários (planilha)** | ❌ falta |
| **Hierarquia (superior direto por matrícula)** | ❌ falta |
| **Onboarding conversacional no WhatsApp (confirmação + declaração)** | ❌ falta — webhook esqueleto existe (v1.2.0), sem credenciais Meta |
| **Agente: fluxo de despesa pelo WhatsApp com perguntas contextuais** | ❌ falta |
| **Motor de decisão: aprova/reprova citando a política (só aprova com regra explícita)** | ❌ falta (insumos do parser prontos) |
| **Fila de revisão manual (gestor/admin) + push de aviso** | ❌ falta |
| ~~Política viva~~ | ⛔ **não fazer** — D-013: o sistema nunca sugere nem acrescenta regras na política |
| **OCR de cupom por visão** | ❌ falta — hook `OCR_PROVIDER` existe sem provider |
| **Kit zip do contador (1 botão)** | ❌ falta |
| SMTP real para e-mails de convite/lembrete | ❌ falta (hoje log) |

## 7. Roadmap proposto (ordem de valor, a detalhar)

> **Prioridade confirmada (12/08/2026):** executar as ondas 1 e 2 primeiro —
> onboarding conversacional + motor de decisão. Onda 3+ segue o plano.
> Transporte WhatsApp da largada: Evolution API (ver §4.2).

1. **Fundação do agente**: credenciais Meta + webhook + sessão de conversa;
   convite vira e-mail → wa.me; onboarding conversacional (confirmação + declaração +
   veículo contextual).
2. **Motor de decisão**: despesa via WhatsApp → parser da política decide →
   aprova/reprova citando regra (só aprova com regra explícita) → dúvida material
   vai para revisão manual do gestor (fila + push).
3. **Dossiê 1-botão**: kit zip completo de recuperação para o contador.
4. ~~Política viva~~ — **removida do roadmap (D-013)**: a política só muda por
   edição humana versionada; o sistema nunca propõe regras.
5. **Escala de UX**: upload em lote, lembretes automáticos, painel-caixa-de-entrada,
   OCR por visão.

---

*Próximo artefato sugerido: arquitetura técnica (componentes, filas, estados de conversa,
modelo de dados novo) derivada deste documento.*

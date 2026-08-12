# reembolsa.ia — Linha do tempo do projeto

> Para se situar: de onde viemos, onde estamos, para onde vamos.
> Atualizado em: 12/08/2026.

---

## Passado — o que já foi construído

### Fundação (v1.0 – v1.1)
- App web full-stack: React + tRPC + Hono + Drizzle/MySQL, Docker na VPS (oreembolsobot.app)
- Empresas, usuários, despesas, evidências, veículos, aprovação manual
- Especificação funcional v1.1 (`docs/especificacao-funcional-v1.1.pdf`)

### v1.2.0 — Estrutura de empresa real
- Convites por e-mail com token; **primeiro usuário vira admin**
- Webhook WhatsApp (esqueleto, sem credenciais Meta — dorme até hoje)
- Hook `OCR_PROVIDER` criado (sem provider implementado)

### v1.4.1 — A tese vira peça de venda
- One-pager `/tese` exportado em PDF A4 e botão de download no site
- Tese: *"Cada campo que a gente pede é uma defesa do seu crédito"*

### v1.4.2 — Primeiro feedback real de usuário (J J Martins, WhatsApp)
- "O site não está responsivo" → **drawer mobile** implementado (overflow zerado)
- Upload de cupom quebrava com SQL cru na tela → **MEDIUMTEXT** + erro amigável + limite 10MB

### v1.4.3 — A política sai do papel (1ª vez)
- Feedback: "fiz upload da política e os valores não foram considerados"
- **Parser de PDF real**: extraiu tetos (alimentação R$ 55, hospedagem R$ 450),
  exigências de evidência, km — com testes (46/46)

### v1.4.4 / v1.4.5 — Higiene de repo público
- Lockfile normalizado (registry oficial + `.npmrc`)
- `.gitignore` protegendo topologia da VPS + `docs/DEPLOY.md` (runbook de deploy)
- Deploy validado na VPS em v1.4.3; gitflow fixo: branch → testes → CHANGELOG → tag → push → versão

---

## Presente — o redesenho (12/08/2026)

Sessão de estratégia (sem código) que redefiniu o produto. Origem: 3 dores —
app pesado para 87 funcionários, cadastro de veículo exigido de quem quer almoço,
aprovação por achismo. Decisões tomadas:

| Decisão | Resumo |
|---|---|
| **Agente-first** | O produto é um agente de reembolso; web vira back office; funcionário vive no WhatsApp |
| **Onboarding progressivo** | Admin sobe planilha → e-mail-isqueiro → funcionário confirma dados e declara despesas → cadastra veículo só se for usar |
| **Gestão por exceção** | Agente aprova/reprova citando a política; cinza sobe um degrau (superior → admin) |
| **Política viva** | Decisão repetida vira texto na política; sem aprendizado de caixa-preta |
| **Dossiê 1-botão** | Kit zip de recuperação fiscal → contador. Produto não entra na parte fiscal |
| **Custo Meta** | Convite por e-mail + wa.me: funcionário inicia a conversa (janela gratuita) |

Artefatos gerados:
- **`docs/PRODUTO.md`** — visão, princípios, atores, fluxos, regras de negócio, gap analysis
- **`docs/ARQUITETURA.md`** — um cérebro (`brain/`), duas superfícies (web + agent), máquina de estados, modelo de dados, releases
- **`docs/DECISOES.md`** — registro ADR das 10 decisões (D-001 a D-010)

### Decisões tomadas depois do redesenho (mesmo dia, execução autorizada)
- **Transporte WhatsApp da largada: Evolution API** self-hosted na VPS (instalada pelo
  usuário), atrás de adapter `WHATSAPP_PROVIDER` — migração futura para API oficial
  sem mudar o produto (D-010)
- **Sem Railway**: agente = 2º container no docker-compose da VPS (D-009)
- **Execução priorizada**: v1.5.0 (fundação do agente) + v1.6.0 (motor de decisão) (D-008)

---

## Futuro — roadmap (ordem de valor-desbloqueio)

| Release | Tema | Entrega principal | Bloqueio externo |
|---|---|---|---|
| **v1.5.0** | Fundação do agente | `brain/` extraído, tabelas novas, adapter WhatsApp (Evolution), onboarding conversacional | **Evolution instalado na VPS** + **SMTP** |
| **v1.6.0** | Motor de decisão | Despesa pelo WhatsApp → aprova/reprova/cinza citando regra; fila de exceções | OCR provider |
| **v1.7.0** | Dossiê 1-botão | Kit zip de recuperação para o contador | decisão: contador destinatário ou usuário? |
| **v1.8.0** | Política viva | Exceção vira regra escrita; versões auditáveis | — |
| **v1.9.0** | Escala de UX | Upload em lote, lembretes, painel caixa-de-entrada | — |

Depois, em aberto: Recomeça como 2º produto sobre a mesma plataforma de agente.

---

## Pendências operacionais (não esquecer)

- [ ] Revisar PRODUTO.md, ARQUITETURA.md e DECISOES.md (você)
- [ ] Instalar Evolution API na VPS + número dedicado (bloqueio da v1.5.0)
- [ ] SMTP (Resend/SES ou similar — 20 min)
- [ ] Revogar o 3º token do GitHub após os deploys (segurança)
- [ ] Backup do Caddyfile da VPS em repo privado de infra
- [ ] Comentário no teste do parser: "PDF real" → "documento fictício"

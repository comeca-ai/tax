# reembolsa.ia — Registro de decisões (ADR)

> Decisões de produto e arquitetura, com contexto e motivo. Formato: uma decisão,
> seu contexto, a escolha, e o que a invalidaria. Mais recente primeiro.

---

## D-012 · Repriorização: admin limpo + convites antes do motor de decisão — 12/08/2026

**Contexto:** o roadmap (ARQUITETURA §8) previa v1.6.0 = motor de decisão. Com o
agente de onboarding de pé (v1.5.0), o gargalo virou a operação do admin:
cadastrar colaboradores, disparar convites e navegar um menu de 11 itens.

**Decisão (do usuário):** v1.6.0 passa a ser **redesenho da navegação do admin +
convites do colaborador (e-mail-isqueiro + link wa.me)**. O motor de decisão
(deslocado) vira a release seguinte.

**O que mudou no concreto:** navegação agrupada em 3 momentos (Dia a dia /
Configurar / Fechar o mês), botões mortos removidos da topbar, tela de Equipe
dividida em "Colaboradores no WhatsApp" (jornada do agente) e "Usuários do
painel" (convites web), mutation `colaboradores.enviarConvite` com link wa.me
pré-preenchido e e-mail via SMTP quando disponível.

---

## D-011 · Evolution roda como stack separado, fora do compose do app — 12/08/2026

**Contexto:** Evolution instalada pelo usuário na VPS. Dentro ou fora do
docker-compose do `tax-app`?

**Decisão (do usuário):** fora — stack independente (mesmo padrão de n8n/Chatwoot/
Coolify), até a migração para a API oficial da Meta.

**Motivos:** zero conflito de deploy/restart entre os stacks; se o Evolution cair
(protocolo), site e back office seguem 100%; na migração para a Meta, apaga-se o
stack e trocam-se 3 variáveis de ambiente; compose fica fora do repo público, junto
dos demais stacks de infra.

**Consequência técnica:** a integração é puramente HTTP — `EVOLUTION_API_URL` +
`EVOLUTION_API_KEY` + `EVOLUTION_INSTANCE` no `.env` do app, e webhook do Evolution
apontando para `/api/whatsapp/webhook`. Nenhum acoplamento de rede/processos além
disso. Adapter `WHATSAPP_PROVIDER=evolution|meta` (D-010) já assume essa forma.

---

## D-010 · Evolution API como transporte WhatsApp da largada — 12/08/2026

**Contexto:** v1.5.0 (onboarding conversacional) e v1.6.0 (motor de decisão) precisam
de WhatsApp funcionando. A Cloud API oficial da Meta exige burocracia (Meta Business,
verificação, aprovação) e cobra por conversa iniciada pela empresa.

**Decisão:** pilotar com **Evolution API** self-hosted (container na VPS, instalado
pelo usuário), atrás de um adapter `WHATSAPP_PROVIDER=evolution|meta`.

**Motivos:** zero burocracia, custo zero por mensagem, validação imediata da
experiência; tudo roda na VPS junto do app (sem Railway/serviço externo).

**Riscos aceitos:** API não-oficial — risco de banimento do número e instabilidade
de protocolo. Mitigação: número dedicado, volume de piloto, conversas iniciadas pelo
funcionário.

**O que a invalidaria:** escala (muitas empresas/volume), banimento recorrente, ou
exigência de conformidade de cliente grande → migrar para `WHATSAPP_PROVIDER=meta`
(troca de adapter, não de produto).

---

## D-009 · Nada de Railway/serviço externo: tudo na VPS — 12/08/2026

**Contexto:** onde hospedar o agente WhatsApp?

**Decisão:** segundo container no mesmo docker-compose da VPS, mesma imagem do app.

**Motivos:** banco MySQL já está na VPS; serviço externo criaria latência, ponto de
falha e custo; mantém o padrão de deploy maduro (git tag → docker compose up).

---

## D-008 · Prioridade de execução: ondas 1 e 2 do roadmap — 12/08/2026

**Contexto:** PRODUTO.md define 5 ondas. Quais atacam primeiro?

**Decisão:** v1.5.0 (fundação do agente) e v1.6.0 (motor de decisão) em sequência.
**Motivo:** maior salto de valor percebido — adesão sem cobrança do admin + fim do
achismo na aprovação. OCR perfeito, política viva e app bonito para o funcionário
ficam para depois (justificativa: cupom ilegível vira pergunta do agente; política
viva só faz sentido com exceções reais acontecendo).

---

## D-007 · Aprovação por gestão de exceção; cinza sobe um degrau — 12/08/2026

**Contexto:** admin aprovando item a item não escala (87 pessoas × N despesas).

**Decisão:** agente aprova/reprova citando a regra da política; zona cinzenta sobe
um degrau hierárquico (superior → admin → topo). O agente reprova, o humano absolve
— nunca o contrário. Na dúvida, o decisor escala (falso cinza custa um clique; falsa
aprovação custa uma glosa).

---

## D-006 · Política viva, sem aprendizado de caixa-preta — 12/08/2026

**Contexto:** proposta inicial era o agente "aprender" com decisões de exceção.

**Decisão (do usuário, prevalece):** decisão repetida vira **texto na política**;
o que não está escrito não é regra. **Motivos:** auditável (contador/fiscal leem o
mesmo documento), justo (regra igual para todos), e força a empresa a ter política
de verdade. Toda despesa registra qual versão da política a decidiu.

---

## D-005 · Onboarding progressivo e self-service — 12/08/2026

**Contexto:** exigir cadastro de veículo de quem quer reembolso de almoço é UX ruim;
admin cadastrando tudo de 87 pessoas é gargalo.

**Decisão (proposta do usuário):** admin sobe a planilha (dados da empresa);
funcionário **confirma** seus dados e **declara** o que costuma pedir; veículo só é
pedido de quem declarou combustível — ou na hora que uma despesa de combustível
chegar. Sem onboarding concluído, não existe despesa (portão único).

---

## D-004 · Convite por e-mail-isqueiro; funcionário inicia a conversa — 12/08/2026

**Contexto:** como levar o funcionário ao WhatsApp sem o admin cobrar?

**Decisão:** e-mail com link `wa.me` pré-preenchido (matrícula/token); o funcionário
inicia a conversa. **Motivos:** na Meta oficial, janela de atendimento sem template
pago; no Evolution, é simplesmente a melhor UX; o motor de adesão é o interesse dele
em receber. Lembretes de não-ativados seguem por e-mail.

---

## D-003 · Dossiê de recuperação 1-botão; produto NÃO entra na parte fiscal — 12/08/2026

**Contexto:** qual a entrega final para o contador? Até onde o produto vai?

**Decisão:** kit .zip com todas as comprovações de recuperação fiscal (documento
fiscal + evidência + veículo/km + motivo + regra aplicada + trilha), gerado com um
botão. O produto **prepara e defende; o contador decide e assina**. **Motivos:**
fora do território regulado, e o contador vira canal de venda, não concorrente.
**Em aberto:** contador é destinatário do zip ou usuário com login (afeta se vira
portal — decisão adiada).

---

## D-002 · Agente-first: um cérebro, duas superfícies — 12/08/2026

**Contexto:** módulos dentro de um produto, ou plataforma modular?

**Decisão (do usuário):** o produto é **um agente de reembolso**. Web vira back
office (admin); funcionário vive no WhatsApp. Arquitetura: `brain/` (decisão existe
uma vez) + `web/` + `agent/` (magro, nunca decide). Se as superfícies divergirem
numa decisão, a tese anti-achismo morre.

---

## D-001 · Cada campo que a gente pede é uma defesa — tese original (reafirmada 12/08/2026)

**Decisão:** perguntar só o dado que defende aquele caso de reembolso, contextual por
despesa. Corolário do onboarding: se o campo não defende nada naquele caso, não é
pedido naquele caso. Todas as decisões acima derivam desta.

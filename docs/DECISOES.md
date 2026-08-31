# reembolsa.ia — Registro de decisões (ADR)

> Decisões de produto e arquitetura, com contexto e motivo. Formato: uma decisão,
> seu contexto, a escolha, e o que a invalidaria. Mais recente primeiro.

---

## D-020 · WhatsApp é o canal principal, mas produção espera homologação — 29/08/2026

**Contexto:** o posicionamento do produto foi reafirmado como fintech de
reembolsos para times de campo: experiência simples, rápida e sem login pelo
WhatsApp. A integração precisa permanecer pronta, mas o canal ainda está em
processo de homologação e não pode ser tratado como disponível em produção.

**Decisão (do usuário):**
1. **WhatsApp continua sendo a superfície principal do colaborador de campo.**
   E-mail e painel são contingência operacional durante a homologação, não uma
   redefinição do produto.
2. **Sem login não significa sem identidade.** O vínculo entre número, convite,
   colaborador e empresa precisa ser validado antes de aceitar uma despesa.
3. Adapter, webhook, sessões e máquina de estados ficam preparados e isolados do
   restante do produto, mas o tráfego real permanece desabilitado até o portão de
   homologação.
4. O canal só é liberado depois de credenciais/número aprovados e teste ponta a
   ponta controlado. Até lá, nenhuma comunicação comercial afirma que o fluxo
   produtivo por WhatsApp já está disponível.

**Consequência:** a pausa operacional registrada em 27/08 não revoga D-002/D-004;
ela vira um estado temporário de implantação. D-010/D-011 permanecem históricas
quanto ao adapter e ao isolamento, mas não autorizam uso produtivo antes da
homologação. **Invalidaria:** decisão explícita de abandonar o WhatsApp como canal
do colaborador.

---

## D-019 · Equipe fica no menu principal, fora de Empresas — 29/08/2026

**Contexto:** hoje `Equipe` já aparece como rota própria no grupo **Configurar**
do menu principal, mas a tela `Empresas` também mantém uma aba `Equipe`. A
duplicação mistura cadastro/configuração da empresa com gestão de pessoas e cria
duas superfícies para o mesmo trabalho.

**Decisão (do usuário):** **Equipe permanece como item próprio no menu principal,
como está agora, e sai de dentro de Empresas.** `Empresas` concentra cadastro e
configurações da pessoa jurídica; `Equipe` concentra colaboradores, usuários do
painel, convites, vínculos, hierarquia, alçadas e estado de ativação.

**Consequências:** permissões continuam aplicadas à rota própria de Equipe; links
contextuais podem levar até ela, mas não se mantém uma segunda tela de gestão
dentro de Empresas. A remoção visual é demanda de implementação futura — este ADR
registra a decisão sem alterar código.

---

## D-018 · Núcleo por metadata migra sem big bang — 29/08/2026

**Contexto:** a política em PDF é a fonte normativa da empresa; os agentes operam
sobre uma representação estruturada, validada e versionada dessa política. O
modelo atual congela categorias em enum compartilhado por reembolso e fiscal.
Trocar esse enum diretamente por `categoria_id` faria banco, contratos, telas e
motor fiscal mudarem ao mesmo tempo.

**Decisão (do usuário):** o núcleo será multiempresa e orientado a metadata, no
estilo Salesforce — entidades estáveis, particularidades por empresa como dados,
sem DDL por cliente — e a migração seguirá **expandir → preencher → duplicar →
comparar → liberar gradualmente → retirar legado**:

1. **Expandir:** criar tabelas/relacionamentos de metadata e referências novas
   nullable, preservando integralmente o enum e os fluxos atuais.
2. **Backfill verificável:** criar a metadata equivalente por empresa, ligar dados
   históricos e bloquear avanço diante de órfão ou associação cross-tenant.
3. **Escrita dupla:** para categorias legadas, gravar modelo antigo e novo. Categoria
   nova pode existir apenas na metadata; sem tradução fiscal, fica `fiscal_pendente`,
   nunca crédito zero ou decisão fiscal implícita.
4. **Modo sombra:** executar a leitura/decisão nova sem afetar o usuário e comparar
   seus resultados com o legado.
5. **Canário por empresa:** ativar a metadata por flag, primeiro em ambiente interno
   e piloto; rollback operacional é desligar a flag, não desfazer dados.
6. **Tradução fiscal separada:** categoria de reembolso é vocabulário do cliente;
   categoria fiscal é taxonomia interna, ligada por mapeamento explícito.
7. **Contrair só no fim:** remover enum e compatibilidade apenas depois de todas as
   empresas migrarem, o fiscal usar a tradução e a observabilidade provar estabilidade.

**Invariantes:** PDF original imutável + hash; ativação transacional; regra
estruturada sempre rastreável ao documento; histórico nunca reclassificado em
silêncio; FKs compostas em toda relação multiempresa. **Consequência:** o brief
0012 não pode executar conversão destrutiva do enum antes da camada fiscal 0013;
deve ser revisado para uma primeira etapa aditiva e compatível.

---

## D-017 · Reembolso é o motor de captura e defesa; os demais motores consomem sua evidência — 29/08/2026

**Contexto:** discussão de arquitetura sobre o papel do reembolso na
plataforma: ele é o motor que está sendo construído primeiro e que depois
gera insumo para os demais módulos — o fiscal é o primeiro deles (D-014).

**Decisão (do usuário):** sim, e fica registrado o sentido exato:
1. **O reembolso é o motor de captura e defesa.** É ele que toca o
   funcionário (a superfície de adesão — o interesse dele é o motor, D-004),
   extrai a evidência, decide contra a política citando a regra e grava a
   trilha versionada (regra citada + versão da política + quem decidiu).
2. **Os demais motores entram a jusante, como consumidores** dessa evidência
   já decidida. O fiscal (créditos, CFOP/NCM/CST, elegibilidade por regime)
   opera sobre uma base que chega defensável; motores futuros idem.
3. **É fluxo de dados, não pipeline de decisão** (reafirma D-014): cada
   motor decide com regras próprias e trilhas independentes. Um cupom
   reprovado no reembolso ainda pode ter tratamento fiscal próprio — um
   motor nunca herda a decisão do outro.
4. **O dossiê (D-016) é o ponto de encontro das camadas**: consolida decisão
   de reembolso (política citada) + apuração fiscal (regras fiscais), sem
   misturar os critérios.

**Motivo estrutural da ordem:** sem captura boa não há matéria-prima — o
reembolso é o único motor com um usuário motivado a alimentar o sistema.
**Invalidaria:** um fluxo real em que o fiscal precise decidir antes do
reembolso, ou qualquer acoplamento de decisão entre motores.

---

## D-016 · Contador é destinatário do dossiê, não usuário — 29/08/2026

**Contexto:** D-003 deixou em aberto se o contador recebe o kit zip
(destinatário) ou ganha login no produto (usuário/portal). A resposta
define o escopo da v1.8.0 e o modelo de `dossies`.

**Decisão (do usuário):** **destinatário**. O dossiê é um zip 1-botão,
entregue por download ou link temporário. Sem portal, sem login de contador,
sem permissão por escritório.

**Motivos:** portal é um segundo produto (auth, sessão, multi-escritório)
para um valor ainda não validado; o zip entrega a defesa completa sem virar
sistema que o contador precise aprender; mantém D-003 pura — o produto
prepara e defende, o contador decide e assina. **Invalidaria:** escritório
contábil com várias empresas clientes pedindo visão consolidada — aí o
painel do escritório nasce como produto separado, não como feature.

---

## D-015 · Exclusão de conta é anonimização; auditoria nunca perde linha — 28/08/2026

**Contexto:** limpeza das contas órfãs do bug de cadastro (v1.9.2) revelou um
conflito de desenho: `log_auditoria` é append-only (nunca UPDATE/DELETE), mas suas
FKs para `usuarios`/`empresas` são `NO ACTION` — usuário com histórico não podia
ser excluído sem apagar trilha.

**Decisão:** exclusão operacional = **anonimização** (dados operacionais apagados,
identidade substituída por valor neutro, trilha de auditoria intacta). A operação é
ela mesma registrada no `log_auditoria` via INSERT. A correção estrutural — FKs do
`log_auditoria` com `ON DELETE SET NULL` (colunas já são anuláveis) — está na fila
em `pipeline/briefs/fk-log-auditoria-set-null.json`; depois dela, DELETE real zera
a referência e preserva a linha. **Invalidaria:** exigência regulatória de
esquecimento total (LGPD art. 18, VI) sobre algum dado — aí a trilha também precisa
de política de retenção/anonimização própria.

---

## D-013 · Sem aprovação fora da política; revisão manual ≠ zona cinzenta; sistema nunca toca a política — 13/08/2026

**Contexto:** o desenho anterior tinha "zona cinzenta" (caso que a política não cobre
→ sobe um degrau) e "política viva" (decisão repetida → sistema propõe texto novo na
política, botão "virar regra"). O usuário corrigiu a doutrina.

**Decisão (do usuário, literal):**
1. **Nenhum reembolso pode ser aprovado que não conste na política.** Se a política
   não autoriza, o agente não aprova — ponto. Aprovação automática exige regra
   explícita citável.
2. **Não existe zona cinzenta de decisão.** O que existe é **revisão manual do
   gestor** para dúvidas *materiais* — imagem ilegível, dado inconsistente,
   comprovante suspeito, caso sem cobertura na política. O gestor decide; se a
   política não cobre o caso, ele não aprova (ou trata com a empresa por fora).
3. **O sistema não sugere nem acrescenta nada na política de reembolso.** A política
   só muda por decisão humana, editando o documento. Sem botão "virar regra", sem
   proposta automática de texto, sem aprendizado — implícito ou explícito.

**Consequências:** D-006 ("política viva") **revogada** — a política é única fonte de
verdade e **estática**: só muda por edição humana versionada. D-007 ajustada: o que
escalava como "cinza" passa a ser **fila de revisão manual do gestor**; o resultado
`cinza` do decisor vira `revisao_manual` (motivo material). O motor fica mais simples
e mais defensável: aprova citando regra, reprova citando regra, ou devolve para o
gestor quando a *evidência* não permite concluir.

---

## D-014 · Reembolso e fiscal são dois motores separados; no reembolso ninguém preenche nada — 14/08/2026

**Contexto:** o produto nasceu como motor fiscal (extração de notas, CFOP/NCM/CST,
créditos) e o reembolso cresceu em cima dele — inclusive herdando telas de
"preenchimento assistido". Caso real (cupom de hortifruti, R$ 90,14, consumidor não
identificado) mostrou a fronteira: no reembolso, a decisão vem da política, não de
formulário.

**Decisão (do usuário):**
1. **O agente de reembolso só faz duas coisas: extrai e verifica.** Verifica contra
   a **política** (D-013: só aprova com regra explícita) e contra **padrões anômalos**
   (valor fora do teto, consumidor não identificado, natureza incompatível com a
   categoria, horário incoerente, nota duplicada).
2. **Negado é negado — ninguém preenche nada.** Não existe formulário de completar
   dado, nem no WhatsApp nem no web. O que a evidência não mostra, ninguém digita.
   Dúvida material → revisão manual do gestor (D-013), que decide olhando a
   evidência, não editando campos.
3. **O motor fiscal entra depois, separado, com suas próprias regras.** O reembolso
   decide se a despesa é devida ao colaborador; o motor fiscal decide o que é
   aproveitável tributariamente (créditos, CFOP/NCM, elegibilidade por regime).
   Um mesmo cupom pode ser **reprovado no reembolso** e ainda assim ter tratamento
   fiscal próprio — decisões independentes, trilhas independentes.

**Consequências:** o contrato do decisor de reembolso não pede nem aceita input
manual de dados da nota; o "preenchimento assistido" pertence exclusivamente ao
motor fiscal (superfície web), fora do fluxo do colaborador. Dossiê do contador
(v1.8.0) consolida as duas camadas: decisão de reembolso (política citada) +
apuração fiscal (regras fiscais), sem misturar os critérios.

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

## D-007 · Aprovação por gestão de exceção — 12/08/2026 — ✏️ **ajustada por D-013 (13/08/2026): "cinza" virou "revisão manual do gestor"; não há mais "virar regra"**

**Contexto:** admin aprovando item a item não escala (87 pessoas × N despesas).

**Decisão:** agente aprova/reprova citando a regra da política; zona cinzenta sobe
um degrau hierárquico (superior → admin → topo). O agente reprova, o humano absolve
— nunca o contrário. Na dúvida, o decisor escala (falso cinza custa um clique; falsa
aprovação custa uma glosa).

---

## D-006 · ~~Política viva~~ — 12/08/2026 — ⚠️ **REVOGADA por D-013 (13/08/2026)**

> A política é a única fonte de verdade e **só muda por edição humana**. O sistema
> não propõe, não sugere e não acrescenta regras — nem a partir de decisões repetidas.
> Registro histórico abaixo.

## D-006 (histórico) · Política viva, sem aprendizado de caixa-preta — 12/08/2026

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

# Escopo técnico factual para fornecedor

> Documento baseado no estado atual do código do repositório `comeca-ai/projeto_tribureembolsa`. O conteúdo abaixo descreve o que está implementado nesta branch e distingue integrações ativas de componentes apenas preparados, opcionais ou ainda não conectados ao fluxo principal.

## 1. Objetivo do projeto

O sistema implementa uma plataforma web de reembolso e recuperação tributária para despesas corporativas, com foco em:

- cadastro de empresas e seus dados fiscais;
- upload de notas/recibos;
- extração automática de dados fiscais;
- classificação e cálculo de créditos/dedutibilidade por regra;
- avaliação de política interna de reembolso;
- fila de revisão humana;
- relatórios operacionais;
- trilha de auditoria;
- onboarding de colaboradores por WhatsApp em um fluxo separado.

Na prática, o repositório concentra um único produto full stack com frontend SPA, backend HTTP/tRPC e banco MySQL.

## 2. Arquitetura de alto nível

### 2.1 Estrutura implementada

- **Frontend**: SPA em React com React Router.
- **Backend**: aplicação Hono com tRPC no endpoint `/api/trpc`.
- **Banco**: MySQL acessado via Drizzle ORM.
- **Entrega**: um único deploy serve API e frontend.

### 2.2 Módulos funcionais observados no código

1. **Núcleo tributário**
   - OCR de nota fiscal;
   - motor fiscal para classificar despesa e apurar créditos;
   - matriz/versionamento de regras;
   - relatórios e dashboard.

2. **Núcleo de política de reembolso**
   - upload de documento de política;
   - extração de regras por parser heurístico ou LLM configurável;
   - ativação/versionamento de política por empresa;
   - simulação de decisão automática.

3. **Núcleo operacional de equipe**
   - convites para acesso ao painel;
   - cadastro de colaboradores;
   - aceite de convite;
   - redefinição/troca de senha.

4. **Núcleo WhatsApp / POC**
   - onboarding conversacional de colaborador;
   - integração com Evolution API;
   - webhook legado Meta;
   - webhook 360dialog isolado para persistência crua de eventos;
   - API interna `/api/v1` para identificação por telefone.

### 2.3 Forma de execução

- **Desenvolvimento**: Vite + plugin de dev server do Hono.
- **Produção**: build do frontend em `dist/public`, bundle do backend em `dist/boot.js`, Hono servindo API e arquivos estáticos da SPA.

## 3. Tecnologias identificadas

### 3.1 Frontend

- React 19
- TypeScript
- Vite 7
- React Router 7
- TanStack React Query
- tRPC React Client
- Tailwind CSS 3
- componentes baseados em Radix UI / shadcn-ui
- Framer Motion
- Recharts
- React Hook Form
- Zod
- react-dropzone
- Sonner

### 3.2 Backend

- Hono
- `@trpc/server`
- SuperJSON
- Drizzle ORM
- mysql2
- Nodemailer
- pdf-parse

### 3.3 Banco e persistência

- MySQL
- Drizzle Kit para geração/migração
- armazenamento híbrido:
  - arquivos de nota/evidência em **base64 no banco**;
  - arquivo original de política em **disco local** (`uploads/politicas`);
  - metadados de storage futuro já previstos em `notas_fiscais`.

### 3.4 Build, qualidade e testes

- `npm run build`
- `npm run check`
- `npm run lint`
- `npm run test` com Vitest
- Docker / Docker Compose

Não foi identificado framework de teste end-to-end dedicado nesta branch.

## 4. Rotas e telas implementadas

### 4.1 Rotas públicas

- `/`: landing page do produto.
- `/tese`: página pública explicando a tese/defesa funcional do motor.
- `/login`: autenticação por e-mail e senha + solicitação de reset.
- `/cadastro`: wizard de cadastro de conta + empresa.
- `/convite/:token`: aceite de convite e criação de senha.
- `/redefinir-senha/:token`: redefinição de senha por token.

### 4.2 Rotas autenticadas do painel

- `/app/dashboard`: visão geral com KPIs, evolução e checklist operacional. Acesso: autenticado.
- `/app/despesas`: listagem e consulta de despesas. Acesso: autenticado.
- `/app/despesas/nova`: fluxo de nova despesa com upload e veredito automático. Acesso: autenticado.
- `/app/rapido`: envio rápido mobile-first com upload único e veredito. Acesso: autenticado.
- `/app/politica`: gestão da política de reembolso por empresa. Acesso: autenticado; mutações críticas exigem admin da empresa/plataforma.
- `/app/revisao`: fila de revisão e decisão sobre despesas. Acesso: exige permissão de revisão.
- `/app/empresas`: cadastro, edição e seleção de empresas. Acesso: autenticado.
- `/app/equipe`: convites e gestão de equipe/colaboradores. Acesso: exige permissão de equipe.
- `/app/relatorios`: relatórios com filtros e exportação CSV/impressão. Acesso: autenticado.
- `/app/regras`: matriz de elegibilidade, linha do tempo e auditoria. Acesso: apenas admin da plataforma na UI.
- `/app/ajustes`: tela de ajustes. Acesso: apenas admin da plataforma na UI.

### 4.3 Observações de navegação

- A empresa ativa do usuário é persistida no `localStorage`.
- Todas as rotas `/app/*` passam pelo gate `RequireAuth`.
- Há gates adicionais de UI para `RequireEquipe`, `RequireRevisao` e `RequireAdmin`.

## 5. Routers tRPC e responsabilidades

### 5.1 `ping`

- `ping`: health check simples do router tRPC.

### 5.2 `auth`

- `registro`: cria conta simples.
- `registroComEmpresa`: cria conta e empresa em transação única.
- `login`: autentica e emite cookie de sessão.
- `logout`: limpa cookie.
- `me`: devolve sessão atual e permissões derivadas.
- `solicitarResetSenha`: cria token de reset e tenta enviar e-mail.
- `redefinirSenha`: redefine senha com token.
- `trocarSenha`: troca senha do usuário autenticado.

### 5.3 `empresas`

- `list`: lista empresas visíveis ao usuário.
- `get`: detalhe de empresa e CNAEs secundários.
- `consultarCnpj`: consulta CNPJ na ReceitaWS para prefill.
- `create`: cria empresa.
- `update`: atualiza cadastro de empresa.

### 5.4 `despesas`

- `uploadNota`: recebe arquivo, persiste nota e executa OCR.
- `create`: cria despesa manualmente a partir da nota confirmada e roda o motor fiscal.
- `processarAutomatica`: fluxo automático que decide reembolso e, se possível, roda o motor fiscal.
- `list`: lista despesas por empresa com filtros.
- `get`: retorna detalhe, nota, créditos e evidências.
- `addEvidencia`: anexa evidência documental.

No frontend atual, as telas `/app/despesas/nova` e `/app/rapido` consomem `uploadNota` + `processarAutomatica`; não foi identificado consumo da procedure `despesas.create` na SPA desta branch.

### 5.5 `revisao`

- `fila`: lista despesas em revisão da empresa consultada.
- `decidir`: aprova/rejeita despesa em revisão, atualiza créditos e registra delegação quando aplicável.

### 5.6 `dashboard`

- `resumo`: consolida KPIs operacionais e fiscais por empresa.

### 5.7 `relatorios`

- `gerar`: monta linhas e totais do relatório.
- `exportarCsv`: gera payload CSV.

### 5.8 `regras`

- `matriz`: lista matriz completa de elegibilidade.
- `vigentes`: filtra regras vigentes por data/categoria.
- `auditoria`: retorna trilha de auditoria da empresa.

### 5.9 `politica`

- `upload`: envia documento da política, extrai regras e cria rascunho.
- `list`: lista políticas da empresa.
- `get`: retorna política completa com regras consolidadas.
- `duplicar`: cria novo rascunho a partir de política existente.
- `updateRegras`: salva edição manual das regras.
- `ativar`: ativa política e versiona em transação.
- `desativar`: desativa política ativa.
- `ativa`: retorna a política ativa da empresa.
- `testar`: simula decisão sem gravar.

### 5.10 `convites`

- `criar`: cria convite de acesso ao painel.
- `listar`: lista convites.
- `revogar`: revoga convite pendente.
- `reenviar`: reemite convite.
- `porToken`: consulta pública do convite.
- `aceitar`: aceita convite e cria conta.

### 5.11 `colaboradores`

- `criar`: cadastra colaborador.
- `listar`: lista colaboradores da empresa.
- `atualizarStatus`: altera status de ativação.
- `enviarConvite`: envia convite do colaborador por e-mail e tenta boas-vindas por WhatsApp.

## 6. Endpoints HTTP adicionais fora do tRPC

- `GET /api/health`: health check HTTP.
- `GET /api/v1/whatsapp/status`: status da API de serviço da POC WhatsApp.
- `GET /api/v1/colaboradores?telefone=...`: resolução de colaborador por telefone E.164; protegida por token de serviço.
- `GET /api/webhooks/whatsapp`: verificação `hub.challenge` do webhook legado Meta.
- `POST /api/webhooks/whatsapp`: recebe eventos da Meta e apenas registra/loga mensagens.
- `POST /api/whatsapp/webhook`: recebe eventos da Evolution e aciona o agente de onboarding.
- `POST /api/webhooks/360dialog`: valida segredo e persiste eventos crus da 360dialog.

## 7. Autenticação e autorização

### 7.1 Modelo de autenticação

- autenticação própria por **e-mail e senha**;
- hash de senha com **scrypt**;
- sessão **stateless** em cookie assinado com HMAC-SHA256;
- cookie: `tax_session`;
- TTL: **7 dias**;
- flags: `HttpOnly`, `SameSite=Lax`, `Secure` apenas quando a requisição chega via HTTPS.

**Observação importante:** no estado atual do código, a sessão não é persistida em tabela de banco. A validação é feita pelo cookie assinado e pela leitura do usuário no banco.

### 7.2 Perfis e permissões

Perfis globais em `usuarios.perfil`:

- `admin`
- `cliente`
- `revisor`

Regras observadas no backend:

- qualquer `protectedProcedure` exige usuário autenticado;
- `cliente` só acessa empresas próprias ou empresas em que está vinculado como colaborador;
- `admin` e `revisor` não passam pelo mesmo filtro restritivo de empresa em `assertEmpresaAcesso`;
- somente **admin da plataforma** ou **usuário criador da empresa** pode alterar política e gerir equipe em nome daquela empresa;
- a fila de revisão exige papel efetivo: admin da plataforma, admin da empresa, aprovador designado ou analista designado;
- o perfil `revisor`, isoladamente, **não** concede revisão da fila pela lógica atual de `podeRevisarDespesas`.

### 7.3 Fluxos complementares

- convite de acesso com token único e expiração de 7 dias;
- reset de senha com token único e expiração de 1 hora;
- aceite de convite pode vincular automaticamente a conta a um colaborador já cadastrado.

## 8. Entidades principais do banco

### 8.1 Núcleo principal do produto

- `usuarios`: contas do painel.
- `empresas`: empresas/tenants do sistema.
- `cnaes_secundarios`: CNAEs secundários por empresa.
- `veiculos`: veículos da empresa para apoio ao fluxo fiscal.
- `notas_fiscais`: documento fiscal extraído/uploadado.
- `despesas`: despesa operacional/resultante do processamento.
- `regras_elegibilidade`: matriz tributária de elegibilidade.
- `creditos_apurados`: créditos e dedutibilidade apurados.
- `evidencias_documentais`: anexos/evidências de suporte.
- `log_auditoria`: trilha de auditoria append-only.
- `politicas_reembolso`: versões da política de reembolso por empresa.
- `convites`: convites de acesso ao painel.
- `resets_senha`: tokens de redefinição de senha.

### 8.2 Núcleo de colaboradores / WhatsApp / POC

- `colaboradores`: pessoas da empresa que pedem reembolso.
- `sessoes_conversa`: estado da conversa de onboarding via WhatsApp.
- `declaracoes_perfil`: categorias declaradas pelo colaborador no onboarding.
- `empresas_config`: configurações operacionais por empresa, incluindo designados.
- `veiculos_colaborador`: veículo cadastral do colaborador.
- `delegacoes_decisao`: rastreio de decisão em nome de outro aprovador.
- `checkins_campo`: posições de campo da equipe externa.
- `whatsapp_webhook_events`: log cru de eventos 360dialog.
- `whatsapp_inbox`: fila durável de inbox WhatsApp.
- `whatsapp_outbox`: fila durável de outbox WhatsApp.

**Nota de escopo:** `whatsapp_inbox` e `whatsapp_outbox` existem no schema, mas o próprio código comenta que o processamento conectado a essas tabelas ainda não está ativado nesta etapa.

## 9. Integrações identificadas no código

### 9.1 Implementadas e utilizáveis mediante configuração

### OCR de nota fiscal

- **Heurístico local**: implementado e default.
  - lê NF-e XML e textos extraíveis;
  - para imagem/PDF sem texto, devolve pendências para revisão/manual assistido.
- **OCR de visão**: implementado e selecionável por `OCR_PROVIDER=visao`.
  - integração com **Mistral OCR**;
  - fallback/alternativa com **OpenAI Responses API**.

### Consulta de CNPJ

- integração com **ReceitaWS** em `empresas.consultarCnpj`;
- usada para preencher razão social, CNAE e UF;
- depende de `RECEITAWS_TOKEN`.

### E-mail

- envio por **SMTP/Nodemailer** para:
  - convite de acesso;
  - convite de colaborador;
  - redefinição de senha.
- sem SMTP configurado, o fluxo continua com fallback manual.

### Política de reembolso

- parser heurístico local implementado;
- parser por **Mistral** implementado e registrável;
- parser por **OpenAI** implementado e registrável;
- suporte a PDF com texto via `pdf-parse`.

### WhatsApp via Evolution

- provider de envio implementado;
- webhook `/api/whatsapp/webhook` implementado;
- agente de onboarding conversacional implementado;
- sem configuração do provider, o fluxo entra em modo log e não derruba o restante do sistema.

### Boas-vindas 360dialog

- envio de template de boas-vindas implementado no convite de colaborador;
- depende de `DIALOG_360_API_KEY` e template configurado.

### 9.2 Implementadas, mas com escopo claramente isolado/preparatório

### Webhook legado Meta

- `GET/POST /api/webhooks/whatsapp` existe;
- o `GET` atende verificação da Meta;
- o `POST` apenas recebe payload e registra/loga mensagens;
- não executa hoje o fluxo de negócio principal de despesa.

### Webhook 360dialog

- `POST /api/webhooks/360dialog` está implementado;
- valida `Authorization` literal contra `DIALOG_360_WEBHOOK_SECRET`;
- extrai e persiste eventos crus em `whatsapp_webhook_events`;
- **não** implementa `WhatsappProvider`;
- **não** está conectado a `getWhatsappProvider()`;
- **não** roteia tráfego real do negócio no estado atual.

### Inbox/Outbox WhatsApp

- tabelas `whatsapp_inbox` e `whatsapp_outbox` já existem;
- o comentário do schema informa que o processamento ainda não foi conectado ao fluxo.

### 9.3 Referenciadas no repositório, mas não ativas no fluxo principal desta branch

### Gemini para parser de política

- existe arquivo `api/modules/reembolso/policy/gemini.ts`;
- porém o parser **não está registrado** em `getPolicyParser()` na branch atual;
- portanto é referência técnica/preparação de código, não integração ativa do fluxo principal.

### Provider Meta para envio WhatsApp

- `WHATSAPP_PROVIDER=meta` é mencionado no seletor;
- hoje retorna `null`;
- portanto trata-se de preparação para provider futuro, não implementação operacional concluída.

## 10. Notas operacionais relevantes para fornecedor

### 10.1 Build e execução

- desenvolvimento: `npm run dev`
- build: `npm run build`
- produção: `npm start`
- type-check: `npm run check`
- lint: `npm run lint`
- testes: `npm run test`

### 10.2 Deploy

- há suporte a execução local com Node 20+;
- há `Dockerfile` multi-stage;
- `docker-compose.yml` sobe app + MySQL 8;
- `docker-entrypoint.sh`:
  - aguarda banco;
  - aplica migrações;
  - executa seed idempotente;
  - sobe a aplicação.

### 10.3 Banco e migrações

- migrations SQL ficam em `db/migrations`;
- aplicação usa `db/migrations/apply.ts`;
- seed é idempotente em `db/seed.ts`;
- Drizzle está configurado para dialeto MySQL.

### 10.4 Sessão, cookies e transporte

- frontend chama `/api/trpc` com `credentials: "include"`;
- a sessão depende do cookie `tax_session`;
- o código considera `X-Forwarded-Proto` para decidir se o cookie deve ser `Secure`;
- atrás de proxy reverso, a configuração correta de HTTPS influencia diretamente a persistência de sessão.

### 10.5 Limites e payloads

- `bodyLimit` do Hono: **50 MB**;
- validação de upload de nota/evidência via contrato: **10 MB** por arquivo em base64;
- `Envio rápido` e `Nova despesa` aceitam imagem, PDF e XML.

### 10.6 Armazenamento de arquivos

- nota fiscal: binário mantido em base64 no MySQL;
- evidência documental: base64 no MySQL;
- política de reembolso: arquivo original salvo em `uploads/politicas`;
- o diretório `uploads` é local ao servidor/contêiner;
- há campos de provider/key/checksum em `notas_fiscais`, indicando preparação para migração futura de storage, mas o fluxo principal atual ainda usa persistência local/banco.

### 10.7 Auditoria e logging

- `log_auditoria` é tratado como append-only;
- eventos relevantes de negócio registram logs explícitos;
- decisões de revisão podem gerar `delegacoes_decisao`;
- webhook 360dialog registra payload cru;
- há uso de `console.log` e `console.error` como logging operacional simples.

### 10.8 Exportação e PDF

- a exportação estruturada implementada no backend é **CSV**;
- na tela de relatórios, o “PDF” atual é gerado por `window.print()` no frontend;
- não foi identificado endpoint backend dedicado para geração binária de PDF.

## 11. Leitura de escopo recomendada para fornecedor

Pelo estado atual do código, o escopo técnico tende a se dividir em quatro frentes relativamente independentes:

1. **Painel web principal**: cadastro, despesas, relatórios, regras e política.
2. **Motor fiscal**: OCR, classificação, cálculo e auditoria.
3. **Fluxo de equipe**: convites, colaboradores e permissões.
4. **Canal WhatsApp/POC**: onboarding, integrações Evolution/360dialog e infraestrutura de filas/eventos.

## 12. Observação final sobre integrações

Este repositório contém tanto integrações operacionais quanto infraestrutura/preparação para integrações futuras. Para escopo comercial e técnico, é importante diferenciar:

- **implementado e já utilizável mediante configuração**;
- **implementado apenas como fundação isolada**;
- **referenciado/preparado no código, mas não efetivamente ativo no fluxo principal da branch atual**.

Essa distinção é especialmente relevante para WhatsApp, OCR por visão, parsers de política por LLM e possíveis evoluções de storage/processamento assíncrono.

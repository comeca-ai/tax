# Changelog — reembolsa.ia (Tax Engine)

Todas as mudanças relevantes deste projeto são documentadas aqui.
Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
versionamento semântico (SemVer): `MAJOR.MINOR.PATCH`.

## [Unreleased] — branch `feat/policy-llm-gemini` (base 1.4.0; versão definida no merge em `master`)

**Política da empresa: tudo nasce do documento.** O gestor vê o texto que o
OCR leu e ajusta as regras extraídas antes de ativar.

### Adicionado
- **Parser de política via LLM** (provider plugável, mesmo padrão do OCR):
  `mistral` (OCR `mistral-ocr-latest` + chat `json_object`) e `gemini`
  (leitura nativa de PDF/imagem). Seleção por `POLICY_PROVIDER`
  (`heuristico` | `mistral` | `llm` = alias de mistral); falha do LLM cai no
  heurístico com aviso — o upload nunca quebra. Variáveis `MISTRAL_API_KEY`,
  `MISTRAL_MODEL`, `MISTRAL_OCR_MODEL`, `GEMINI_API_KEY`, `OCR_GEMINI_MODEL`
  passam pelo `docker-compose.yml`
- **Texto lido do documento** no passo "Revisar regras": painel lado a lado
  (desktop) / accordion (mobile) com confiança da extração, parser usado,
  avisos (inclusive páginas com problema de leitura) e o texto do OCR
- **Regras extraídas editáveis**: agrupadas por tema, com editar inline,
  remover e adicionar (com seletor de tema) antes de ativar; passo
  "Simular e ativar" mostra "Regras que serão ativadas"
- **Regras extraídas como única fonte** (`regrasExtraidas` em `RegrasPolitica`):
  o passo "Revisar regras" mostra só cards estruturados por tema (categoria,
  valor, unidade, reembolsável, comprovante); limites por categoria,
  exigências e tetos gerais são derivados no servidor (`api/policy/derivar.ts`)
  em `updateRegras`/`ativar` — teto geral só de regra de governança sem
  categoria, classificada pelo campo `reembolsavel` (vedado → negação;
  exceção → revisão humana; sim + "aprovação automática" no texto →
  aprovação automática); nada é inferido de texto livre (D-013). `updateRegras` devolve as regras consolidadas; resumo do
  passo 3 e do card "Política ativa" ganham o bloco "O que o agente vai aplicar"
- `APP_URL` no ambiente; cookie de sessão só leva `Secure` quando a URL
  pública é HTTPS
- Testes: `texto.test.ts`, `mistral.test.ts`, `observacoes.test.ts`
  (vitest passa a coletar `src/**/*.test.ts`)

### Corrigido
- Parser Mistral: política com dezenas de regras estourava `max_tokens` (8 000) e
  devolvia JSON cortado → caía no heurístico. Agora: teto 32 000 tokens, detecção
  de `finish_reason=length`/JSON inválido com nova tentativa compacta, prompt
  enxuto (só os campos consumidos pelo mapeador), modelo padrão
  `mistral-medium-latest` (~2× mais rápido) e timeout do chat de 240 s

### Alterado
- Parser Mistral grava o markdown integral do OCR em `texto_extraido`
  (truncado a 65 000 bytes UTF-8, sem partir caractere); o resumo da
  extração passou para os avisos. Heurístico usa o mesmo truncamento
- Resumo da política (passo "Simular e ativar" e card "Política ativa") ficou
  escaneável: cabeçalho de números (regras · reembolsáveis · exceções · vedadas
  · temas), "O que o agente vai aplicar" sobe para o topo em cards, regras
  agrupadas em accordion por tema (fechado por padrão, "Expandir/Recolher
  todos") com valor alinhado e unidade por extenso ("por dia", "%", "USD 80")

## [1.4.0] — 2026-08-09

### Adicionado
- **Página pública "A Tese" (`/tese`)** — defesa das decisões de produto como
  argumento comercial e de conformidade:
  - A tese em números (9,25% PIS/COFINS · ICMS ad rem · 34% IRPJ+CSLL)
  - As 4 glosas que a Receita faz → as 4 defesas do produto (evidência RF-04,
    matriz CNAE + segregação §7.4, plausibilidade de veículo RF-09, memorial +
    versionamento RF-07 + log imutável)
  - "O que o reembolsa.ia nunca faz" (4 garantias)
  - Seção "Para o seu contador" (metodologia + referências legais) com
    disclaimer de aconselhamento tributário
  - Link no Navbar e no Footer
- **Explicações contextuais no app** (reduz atrito, justifica o "porquê"):
  - Banner dismissível em Veículos (plausibilidade do crédito de combustível)
  - Linha de defesa na caixa de evidência obrigatória (drawer da despesa)
  - Nota sobre segregação uso misto nos campos de km do wizard

## [1.3.0] — 2026-08-09

### Adicionado
- **Consulta de CNPJ na Receita Federal (ReceitaWS)** com preenchimento
  automático do cadastro de empresa:
  - Botão **"Buscar na Receita"** ao lado do campo CNPJ — na página de Empresas
    (criar/editar) e no wizard de cadastro (signup, funciona sem login)
  - Preenche razão social, CNAE principal, CNAEs secundários e UF — tudo
    continua editável após o prefill
  - CNAE completo da Receita (`64.22-1-00`) normalizado para o formato curto
    do app (`64.22-1`); CNAEs fora da lista curada entram no combobox com
    código + descrição vindos da API
  - Aviso âmbar persistente quando a situação cadastral não é ATIVA
  - Endpoint server-side `empresas.consultarCnpj` (público) com timeout 10s,
    validação de checksum do CNPJ e mensagens PT-BR para 429 (plano gratuito:
    3 consultas/min), CNPJ inválido e não encontrado
  - Token via `RECEITAWS_TOKEN` no `.env` (opcional — sem ela o botão avisa
    que a consulta não está configurada); repassada pelo docker-compose
  - Testes: +12 (38/38 no total); smoke test ao vivo do endpoint

## [1.2.3] — 2026-08-09

### Corrigido
- **docker-compose.yml**: serviço `app` renomeado para `tax-app` em rede
  dedicada `tax-net` — evita colisão de alias de rede quando o stack divide
  uma rede de proxy reverso (Caddy/Traefik) com outro projeto que também tem
  serviço `app` (o alias resolvia para os dois containers em round-robin e os
  domínios serviam o site um do outro). README ganhou a orientação de
  `reverse_proxy tax-app:3000` no Caddyfile

## [1.2.2] — 2026-08-09

### Corrigido
- **Página sem CSS após deploy (self-host)**: `index.html` agora é servido com
  `Cache-Control: no-cache` e os assets com hash (`/assets/*`) com
  `max-age=31536000, immutable` — antes, browser/proxy cacheavam o HTML antigo
  que apontava para assets inexistentes (site todo desestilizado, variando por
  navegador conforme o cache local; também quebrava o layout mobile)
- **Dockerfile**: `npm ci --include=dev` nos dois estágios — com
  `NODE_ENV=production` o npm pulava devDependencies e o entrypoint não
  encontrava `tsx`/`drizzle-kit` (nem o `vite` no build)
- **package-lock.json**: 263 URLs `resolved` normalizadas de mirrors
  (`npm.mirrors.msh.team`, `registry.npmmirror.com`) para `registry.npmjs.org`
  — o lock gerado no ambiente de build apontava para registry privado e o
  `npm ci` falhava silenciosamente no VPS (exit 0 com `vite: not found`)
- **.dockerignore**: excluídos `.env`, `uploads/` e `docker-compose.override.yml`
  do contexto de build (segredos fora da imagem)

## [1.2.1] — 2026-08-09

### Corrigido
- **docker-compose.yml** agora repassa ao container as variáveis opcionais da
  v1.2.0: `APP_URL` (sem ela, os links de convite saíam como
  `http://localhost:3000` no container), `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/
  `SMTP_PASS`/`SMTP_FROM` (convites por e-mail) e `WHATSAPP_VERIFY_TOKEN`
  (webhook WhatsApp). Todas com default seguro — basta preencher no `.env`

## [1.2.0] — 2026-08-09

### Adicionado
- **Primeiro usuário = admin + convites por e-mail**:
  - O primeiro cadastro da plataforma (banco vazio) vira `admin` automaticamente;
    cadastros seguintes entram como `cliente`
  - Página **Equipe** (`/app/equipe`, somente admin): convidar por e-mail com
    perfil (admin/cliente/revisor), listar convites (pendente/aceito/revogado/
    expirado), reenviar, revogar
  - Convite = link com token único válido por 7 dias; página pública de aceite
    `/convite/:token` (define nome + senha, sai logado)
  - Envio de e-mail plugável via SMTP (`SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/
    `SMTP_PASS`/`SMTP_FROM`, nodemailer) — **sem SMTP configurado o app mostra
    o link para copiar ou compartilhar no WhatsApp** (nunca bloqueia o convite)
  - DB: tabela `convites` (migração 0002)
- **Envio Rápido** (`/app/rapido`): fluxo de 3 toques para o colaborador —
  foto do recibo (câmera no mobile) → confirma os campos do OCR → veredito
  (motor tributário + agente de política). Reutiliza o wizard existente
- **Onboarding** no Dashboard: checklist de 4 passos (empresa, veículo,
  política ativa, primeira despesa) com progresso e dismiss persistente
- **WhatsApp (fundação)**:
  - Compartilhamento de convites via `wa.me` (funciona sem conta Meta)
  - Webhook `/api/webhooks/whatsapp` com verificação Meta (`WHATSAPP_VERIFY_TOKEN`)
    — base para o futuro bot (foto de recibo → OCR → despesa); passo a passo no README
- Testes: +6 (26/26 no total); smoke test do fluxo de convite ponta a ponta

## [1.1.0] — 2026-08-09

### Adicionado
- **Agente de Política de Reembolso**: além da matriz fiscal, a empresa sobe o
  documento da própria política de reembolso e um agente passa a avaliar cada
  despesa → **aprova**, **nega** ou **manda para revisão humana**:
  - Upload do documento (PDF/imagem/texto) na nova página **Política** (`/app/politica`);
    parser plugável via `POLICY_PROVIDER` (default `heuristico`) extrai regras
    estruturadas: tetos por categoria, exigência de veículo cadastrado, exigência
    de evidência, limiares de aprovação automática / revisão humana / negação
  - Wizard de importação em 3 passos (upload → revisão das regras extraídas →
    ativação), com edição manual de todas as regras antes de ativar
  - Versionamento de políticas: ativar nova versão arquiva a anterior
    (transação atômica); histórico de versões na página
  - Agente avaliador determinístico (`api/policy/agent.ts`) com trilha de
    regras aplicadas (passou/falhou/revisar) e motivos em PT-BR; default
    conservador = revisão humana
  - Integração ao fluxo existente: veredito da política aparece no resultado
    do wizard de nova despesa (OCR), no drawer da despesa e na fila de revisão;
    `negado` → despesa rejeitada; `revisão humana` → entra na fila RF-05
  - **Simulador** (dry-run) na página da política para testar cenários sem
    gravar nada
  - DB: tabela `politicas_reembolso` + colunas `politica_decisao`,
    `politica_motivo`, `politica_versao_aplicada` em `despesas` (migração 0001)
  - Seed: política demo ATIVA (v1) para Transportes Demo Ltda
  - Testes: +10 testes do agente (20/20 no total)

### Corrigido
- **Deploy fresh-DB**: migrações SQL agora são versionadas no repositório
  (removido `db/migrations/*.sql` do `.gitignore`) e aplicadas pelo
  entrypoint/setup via `db/migrations/apply.ts` — não interativo e idempotente
  (inclui `ER_FK_DUP_NAME`), substituindo `drizzle-kit migrate`

## [1.0.0] — 2026-08-09

### Adicionado
- **Sistema completo do Tax Engine** conforme especificação funcional v1.1:
  - Auth própria (email/senha, scrypt + sessão HMAC em cookie httpOnly), perfis admin/cliente/revisor
  - Cadastro multi-empresa (RF-00: CNAE, regime tributário, UF) com validação de CNPJ e combobox CONCLA
  - OCR plugável via upload (NF-e XML parseado; imagem/PDF → preenchimento assistido; provider de visão via `OCR_PROVIDER`)
  - Motor de regras RF-00 a RF-09: matriz CNAE × categoria (111 regras seedadas), crédito vs dedutibilidade IRPJ/CSLL em trilhas paralelas, segregação uso misto (§7.4), versionamento por data do fato (RF-07), teste de plausibilidade RF-09
  - Fila de revisão humana (RF-05) com evidência obrigatória (RF-04) e trilha de auditoria imutável
  - Dashboard (RF-08), Relatórios com exportação CSV/PDF (RF-06), Regras & Matriz com linha do tempo regulatória 2024→2033
  - Landing page completa (marketing) + 8 telas do app
- **Deploy self-hosted**: Dockerfile, docker-compose.yml (app + MySQL 8), entrypoint com migração + seed automáticos, setup.sh
- Documentação completa em README.md (PT-BR)
- Banco: 10 tabelas (Drizzle + MySQL), seed com 3 usuários demo + empresa demo + 111 regras

### Infra de repositório
- Branch default `main`; fluxo de trabalho: branches `feat/*`/`fix/*` → merge → tag de versão

# Changelog — reembolsa.ia (Tax Engine)

Todas as mudanças relevantes deste projeto são documentadas aqui.
Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
versionamento semântico (SemVer): `MAJOR.MINOR.PATCH`.

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

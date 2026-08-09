# reembolsa.ia — Tax Engine

Motor de recuperação tributária para pequenas empresas brasileiras. O usuário sobe a nota fiscal (foto/PDF) na plataforma → o OCR extrai os campos fiscais → o motor classifica a elegibilidade de crédito por **CNAE × categoria × regime tributário**, quantifica o valor recuperável (**PIS/COFINS, ICMS, CBS/IBS**) e a dedutibilidade (**IRPJ/CSLL**) em trilhas paralelas, e gera relatórios, memorial de cálculo e trilha de auditoria imutável.

> ⚖️ **Aviso jurídico**: classificações de **Média confiança** devem ser validadas por um advogado tributarista antes da formalização. Este sistema identifica e fundamenta oportunidades — não presta aconselhamento jurídico individualizado.

---

## 1. Quick start

```bash
./setup.sh        # instala dependências, sincroniza o banco, roda o seed e sobe o app
```

Acesse http://localhost:3000 e entre com uma das contas seed:

| Perfil | Email | Senha |
|---|---|---|
| Admin | `admin@reembolsa.ia.br` | `Admin@12345` |
| Revisor (fila RF-05) | `revisor@reembolsa.ia.br` | `Revisor@12345` |
| Cliente (empresa demo) | `cliente@demo.com.br` | `Cliente@12345` |

A conta cliente vem com a empresa **Transportes Demo Ltda** (CNAE 49.30-2, Lucro Real, SP) e veículo demo (ABC1D23, 8,5 km/L, R$ 0,85/km) — pronta para lançar despesas e ver o motor em ação. O seed também carrega **111 regras de elegibilidade** (matriz CNAE × categoria × tributo + IRPJ/CSLL + ICMS ad rem).

### Manual (sem o script)

```bash
npm install
# aplica as migrações SQL (não interativo, idempotente):
for f in db/migrations/0*.sql; do npx tsx db/migrations/apply.ts "$(basename "$f")"; done
npx tsx db/seed.ts     # matriz de regras + alíquotas ICMS + dados demo (idempotente)
npm run dev            # http://localhost:3000
```

Produção: `npm run build && npm start`.

---

## 1.1 Deploy self-hosted (Docker — recomendado para VPS)

A stack completa (app + MySQL 8) sobe com **um comando**:

```bash
git clone https://github.com/comeca-ai/tax.git && cd tax

# 1. Configure os segredos
cp .env.docker.example .env
# edite .env: APP_SECRET (gere com: openssl rand -base64 48) e senhas do MySQL

# 2. Suba tudo
docker compose up -d --build

# 3. Acesse
# http://SEU_IP:3000  (ou http://localhost:3000)
```

O container do app **aguarda o MySQL, aplica as migrações e roda o seed automaticamente** na primeira subida (ver `docker-entrypoint.sh`). Os dados ficam no volume `db_data` (persistem entre restarts/rebuilds).

Comandos úteis:

```bash
docker compose logs -f tax-app  # acompanhar logs
docker compose down            # parar (dados persistem)
docker compose down -v         # parar e APAGAR o banco (cuidado)
docker compose up -d --build   # atualizar após git pull
```

**HTTPS/domínio (opcional):** coloque um reverse proxy na frente — exemplo nginx:

```nginx
server {
  listen 80;
  server_name tax.seudominio.com.br;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 50m;   # upload de notas
  }
}
```

Depois emita o certificado: `sudo certbot --nginx -d tax.seudominio.com.br`.

**Caddy com rede compartilhada entre projetos:** o serviço do app chama-se
`tax-app` (rede `tax-net`) — use esse nome no upstream do Caddyfile
(`reverse_proxy tax-app:3000`). **Nunca** conecte dois projetos com serviço
chamado `app` à mesma rede de proxy: o alias `app` resolve para os dois
containers em round-robin e os domínios trocam de site entre si.

### Sem Docker (VPS bare-metal)

Pré-requisitos: **Node 20+** e **MySQL 8** rodando.

```bash
git clone https://github.com/comeca-ai/tax.git && cd tax
cp .env.example .env
# edite .env:
#   DATABASE_URL=mysql://USUARIO:SENHA@127.0.0.1:3306/taxengine
#   APP_SECRET=$(openssl rand -base64 48)
npm install
# aplica as migrações SQL (não interativo, idempotente):
for f in db/migrations/0*.sql; do npx tsx db/migrations/apply.ts "$(basename "$f")"; done
npx tsx db/seed.ts     # regras + dados demo
npm run build
npm start              # sobe na porta 3000
```

Para manter no ar: `pm2 start dist/boot.js --name tax-engine && pm2 save` (instale com `npm i -g pm2`).

> 💡 A autenticação é própria (email/senha), então viaja 100% com o código. O único requisito externo é um MySQL acessível via `DATABASE_URL`.

---

## 2. Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React 19 + TypeScript + Vite 7 + Tailwind CSS v3.4 + shadcn/ui |
| Animações | GSAP + ScrollTrigger (landing), Framer Motion (app), Lenis, Recharts |
| Backend | Hono + tRPC 11 (type-safe ponta a ponta, superjson) |
| Banco | Drizzle ORM + MySQL (provisionado pela plataforma — zero configuração) |
| Auth | Email + senha próprios (scrypt + sessão HMAC-SHA256 em cookie httpOnly `tax_session`, 7 dias) |
| OCR | Provider plugável (`api/ocr/`) — default `heuristico` (lê NF-e XML completo; imagem/PDF cai no preenchimento assistido), pronto para IA de visão |

## 3. Estrutura

```
├── api/                  # Backend (Hono + tRPC)
│   ├── auth/             # Sessão própria (login/senha) — cookie httpOnly
│   ├── engine/           # Motor de regras tributárias (RF-02, RF-03, RF-07, RF-09, §7.4)
│   ├── ocr/              # OCR plugável (heuristicProvider default; visionProvider stub)
│   ├── routers/          # auth, companies, vehicles, expenses, review, evidences,
│   │                     # dashboard, reports, rules
│   └── router.ts         # Registro dos routers
├── contracts/            # Tipos/enums compartilhados front↔back (@contracts/)
├── db/
│   ├── schema.ts         # 10 tabelas (ver §4)
│   └── seed.ts           # Matriz de elegibilidade + alíquotas ICMS + dados demo
├── src/
│   ├── pages/            # Landing, Login, Cadastro, app/* (Dashboard, Despesas,
│   │                     # Nova Despesa, Revisão, Veículos, Empresas, Relatórios, Regras)
│   ├── components/app/   # AppShell, ConfidenceBadge, MoneyValue, DataTable...
│   └── hooks/useAuth.ts  # Sessão do usuário
├── uploads/              # Notas fiscais e evidências (servidas em /uploads/*)
└── setup.sh              # Inicialização com um comando
```

## 4. Modelo de dados

| Tabela | Conteúdo |
|---|---|
| `users` | name, email, passwordHash, role (admin/cliente/revisor) |
| `sessions` | Sessões opacas (token + expiração) |
| `companies` | CNAE principal/secundários, regime tributário, UF (RF-00) |
| `companyMembers` | Equipe multi-empresa por perfil |
| `vehicles` | placa, RENAVAM, km/L declarado, tarifa de reembolso/km |
| `expenses` | categoria, valor_total, **valor_fiscal** ≠ **valor_reembolsavel**, km comercial/não comercial, litros, confiança, status, divergência RF-09 |
| `fiscalNotes` | CNPJ emitente, CFOP, NCM, CST/CSOSN, campos IBS/CBS, flag monofásico |
| `eligibilityRules` | (CNAE, categoria, tributo, tipo_beneficio, confiança, base legal, vigência) — versionadas |
| `assessedCredits` | tributo, tipo (crédito\|dedutibilidade), valor, status, **memorial de cálculo** |
| `evidences` | contrato / ordem de serviço / roteiro / teste de consumo (RF-04) |
| `auditLogs` | Log imutável: regra aplicada, versão, data, ator (RF-04/RF-10) |

## 5. Motor de regras (resumo funcional)

- **RF-00** — Sem CNAE + regime + UF, a empresa fica "cadastro incompleto" e o motor não processa.
- **RF-02** — Classificação: categoria × CNAE × regime vigente **na data do fato gerador** (RF-07) → Alta / Média / Baixa / Vedado.
- **RF-03** — Quantificação em **duas saídas paralelas, nunca somadas**: crédito (PIS/COFINS, ICMS, CBS/IBS) e dedutibilidade (IRPJ 25% + CSLL 9% sobre base dedutível = despesa − créditos CBS/IBS).
- **§7.4** — Uso misto: `%comercial = km_comercial / (km_comercial + km_não_comercial)`; `valor_fiscal = valor_nota × %comercial`. O reembolso ao colaborador (`tarifa/km × km_comercial`) é cálculo **independente**.
- **RF-05** — Alta confiança → liberada automaticamente; Média/Baixa → fila de revisão humana; aprovação **exige evidência documental** (RF-04).
- **RF-09** — Combustível com veículo cadastrado: `consumo_real = km ÷ litros`; divergência > 15% do km/L declarado rebaixa a confiança e manda para revisão.
- **Versionamento (RF-07)** — Ex.: PIS/COFINS de diesel/GLP zerado por MP 1.340/2026 para fatos ≥ 11/03/2026; fator 90% "a confirmar" (LC 224/2025) para fatos ≥ 01/04/2026; CBS/IBS apenas com destaque na nota a partir de 2027.

A matriz de elegibilidade completa (10 CNAEs × 6 categorias) e as bases legais estão no seed e na tela **Regras & Matriz**.

## 6. OCR plugável

`api/ocr/` define o contrato estável — o provider recebe `{ arquivoNome, arquivoMime, arquivoBase64 }` e devolve `OcrExtracao`:

```ts
type OcrExtracao = {
  cnpjEmitente: string | null; cfop: string | null; ncm: string | null; cst: string | null
  valor: number | null; dataFatoGerador: string | null  // yyyy-mm-dd
  litros: number | null; categoriaSugerida: CategoriaDespesa | null
  confiancaExtracao: "alta" | "media" | "baixa"
  camposPendentes: string[]   // campos que exigem preenchimento manual assistido
  provedor: string; avisos: string[]
}
```

- **Default (`heuristico`)**: parseia **NF-e em XML** completa (emitente, CFOP, NCM, CST, valor, data, litros). Upload de imagem/PDF binário cai no **preenchimento assistido** — o wizard de Nova Despesa destaca `camposPendentes` para o usuário completar.
- **OCR real (IA de visão)**: implemente um provider de visão com sua chave e selecione por variável de ambiente:

```bash
OCR_PROVIDER=vision
OCR_API_KEY=sk-...        # OpenAI ou Gemini
```

Nenhuma outra parte do sistema muda — o wizard já exibe confiança por campo e correção assistida.

## 7. Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DATABASE_URL` | sim (auto na plataforma) | Conexão MySQL (gerada no `.env` pelo provisionamento) |
| `OCR_PROVIDER` | não (default `heuristic`) | `heuristic` \| `vision` |
| `OCR_API_KEY` | só p/ `vision` | Chave da IA de visão |

## 8. Scripts npm

| Comando | Ação |
|---|---|
| `npm run dev` | Dev server com HMR (porta 3000) |
| `npm run build` | Build de produção |
| `npm start` | Servidor de produção |
| `npx tsx db/migrations/apply.ts <arquivo.sql>` | Aplica uma migração SQL (não interativo, idempotente) |
| `npm run db:generate` | Gera nova migração a partir de `db/schema.ts` (desenvolvimento) |
| `npm run test` | Testes (Vitest) |
| `npm run check` | Type-check |

## 9. Segurança e LGPD

- Senhas com hash **scrypt**; sessão assinada HMAC-SHA256 em cookie httpOnly `tax_session` (7 dias).
- Toda rota `/app/*` protegida por `RequireAuth`; procedures sensíveis exigem sessão; a fila de revisão (`revisao.*`) é restrita aos perfis `revisor`/`admin`.
- Dados fiscais e de veículos (placa/RENAVAM) restritos por perfil e por empresa (cliente só enxerga as próprias empresas).
- `log_auditoria` é append-only: nenhuma rota atualiza ou apaga registros.

## 10. Routers tRPC (visão geral)

`auth` (registro, login, logout, me, trocarSenha) · `empresas` (list/get/create/update — RF-00) · `veiculos` (CRUD) · `despesas` (uploadNota OCR, create → motor, list/get, addEvidencia) · `revisao` (fila, decidir — RF-04/RF-05) · `dashboard` (resumo — RF-08) · `relatorios` (gerar, exportarCsv — RF-06) · `regras` (matriz, vigentes por data — RF-07, auditoria).

Contrato completo dos tipos em `contracts/types.ts`. Detalhes de implementação do motor em `api/engine/` (com testes em `api/engine/engine.test.ts`).

### Convites de usuários (v1.2.0)

- O **primeiro usuário** cadastrado na plataforma vira **admin** automaticamente; os demais cadastros diretos entram como `cliente`.
- O admin convida os demais usuários na tela **Equipe** (router `convites`: `criar`, `listar`, `revogar`, `reenviar`, `porToken`, `aceitar`), escolhendo o perfil (`admin`, `cliente` ou `revisor`). O convite é um link com token único que expira em 7 dias.
- **Sem SMTP configurado** (`SMTP_HOST` ausente) o app não envia e-mail: o link de aceite é exibido para o admin copiar e compartilhar manualmente (ex.: WhatsApp). Com SMTP configurado, o convite chega por e-mail.

### WhatsApp (fundação)

- **O que já funciona**: links `wa.me` para o admin compartilhar convites pelo WhatsApp direto da tela de Equipe.
- O backend já expõe o webhook `/api/webhooks/whatsapp`: o `GET` atende à verificação da Meta (`hub.mode`, `hub.verify_token`, `hub.challenge`) e o `POST` recebe eventos e registra as mensagens no log do servidor.
- **Para o bot completo** (ainda não implementado): criar um app no [Meta for Developers](https://developers.facebook.com/), ativar a **WhatsApp Cloud API**, definir `WHATSAPP_VERIFY_TOKEN` no `.env` e apontar a URL do webhook (`https://<seu-dominio>/api/webhooks/whatsapp`) no painel da Meta. A automação planejada — o usuário envia **foto do recibo → pipeline OCR → despesa criada** — vem na sequência do roadmap.

## 11. Limitações conhecidas (v1)

- Alíquota ICMS ad rem é um valor de referência único (R$ 1,0061/L diesel) — parametrizável por UF via seed futuro.
- CBS/IBS gera alerta informativo (extração de valor destacado entra com a obrigatoriedade plena em 2027).
- Sessão stateless: trocar a senha não revoga tokens antigos.
- Upload de imagem/PDF sem IA de visão → preenchimento assistido (configure `OCR_PROVIDER=vision`).

## 12. Roadmap (da especificação v1.1)

1. ~~Fase 1 (MVP)~~ → entregue ampliado: todas as categorias + revisão + IRPJ/CSLL
2. Captura de campos CBS/IBS conforme destaque obrigatório nas notas (2027+)
3. Exportação EFD-Contribuições / integração contábil
4. OCR de visão real (plugável, contrato pronto) e consulta ao Ambiente Nacional do IBS (art. 47, LC 214/2025)

## 10. Roadmap (da especificação v1.1)

1. ~~Fase 1 (MVP)~~ → entregue ampliado: todas as categorias + revisão + IRPJ/CSLL
2. Captura de campos CBS/IBS conforme destaque obrigatório nas notas (2027+)
3. Exportação EFD-Contribuições / integração contábil
4. OCR de visão real (plugável, contrato pronto) e consulta ao Ambiente Nacional do IBS (art. 47, LC 214/2025)

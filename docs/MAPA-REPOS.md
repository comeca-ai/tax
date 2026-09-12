# Mapa da família — o que entra no `tax`

Decisão: o repo canônico do produto é **comeca-ai/tax** (`reembolsa.ia`).
Não é monorepo de 350 apps. É um produto com dois motores.

```
WhatsApp (foto) → motor REEMBOLSO (política) → paga o colaborador
                 → motor FISCAL   (CNAE × tributo) → dossiê do contador
```

Dois motores, nunca somados. Isso já está em `docs/PRODUTO.md` (D-014).

---

## 1. O que já vive aqui

| Peça | Onde |
|---|---|
| Motor tributário (RF-00..RF-09) | `api/modules/fiscal/` |
| Política + decisor + agente WhatsApp | `api/modules/reembolso/` |
| OCR plugável | `api/modules/fiscal/ocr/` |
| Auth, empresas, veículos, despesas, revisão | `api/routers/` + `src/pages/` |
| Docker + MySQL | `docker-compose.yml` |

O app Lovable **não substitui** isto. É geração anterior (Supabase/TanStack).
O `tax` é a versão self-hosted que vale.

---

## 2. O que trazer (extrair peça, não copiar repo)

Fonte única do legado Lovable: `comeca-ai/reembolso-inteligente-2ee7fd7d` @ `05547ccf`.

| Trazer | De | Para no `tax` | Por quê |
|---|---|---|---|
| Pipeline SEFAZ / chave 44 / nfe.io | `src/lib/nfe*.ts`, `compliance.*` | `api/modules/fiscal/nfe/` | tax ainda não consulta situação da nota |
| Detecção foto-de-foto | `.agents/skills/recibo-foto-de-foto` | `api/modules/reembolso/fraude/` | padrão anômalo que o decisor pede |
| Webhook Evolution de **comprovante** (não só onboarding) | `src/routes/api/public/evolution.ts` | estender `WHATSAPP_PROVIDER` | tax tem onboarding; falta o ciclo da foto |
| Idempotência `wa_message_id` | mesma rota | tabela de despesas / mensagens | evita duplicar cupom |
| DOCUMENTACAO.md + skills | raiz e `.agents/skills` | `vendor/lovable-reembolso/` (somente leitura) | arquivo, não runtime |

Não trazer: UI TanStack, Supabase client, RLS, Lovable Cloud, página `/teste-webhook`, `.env` commitado.

Clones para arquivar (não mergear):

- `reembolso-inteligente` (jun/2026, SHA `12a1c8aa`)
- `reembolso-inteligente-0f414b11`
- `reembolso-inteligente-8a2287f3` ← **tornar privado** + rotacionar secrets
- `reembolso-inteligente-62274548`
- `reembolso1` (scaffold Next)
- `reembolsaa` (Base44)
- `reembolsa_motor` (README vazio)

---

## 3. O que é primo, mas não entra no `tax`

| Repo | Job | Destino |
|---|---|---|
| `fiscal` | Passaporte de crédito ICMS (outro CNPJ, outro contrato) | fica sozinho |
| `alcadaai` | alçada de desconto comercial | fica sozinho |
| `cnpj-data` / `cnpj-jp` | pipeline CNPJ | utilitário; `tax` já usa ReceitaWS |
| Sebrae, Ultravis, Tandera, etc. | outros produtos | fora |

Misturar Passaporte Fiscal ou Alçada aqui quebra o job: o `tax` é agente de reembolso + dossiê para o contador. Não é homologação de ICMS nem governança de preço.

---

## 4. Como o `tax` fica organizado

```
tax/
  api/
    modules/
      reembolso/     # política, decisor, agente WhatsApp, fraude
      fiscal/        # motor de crédito + OCR + (futuro) nfe/
    routers/         # back office
  src/pages/         # back office web
  docs/              # produto, decisões, este mapa
  vendor/
    lovable-reembolso/   # snapshot só leitura do 2ee7fd7d (quando copiado)
```

Runtime único: Hono + tRPC + MySQL + Docker. Nada de segundo frontend Lovable em produção.

---

## 5. Ordem de execução

1. Este arquivo. Fonte da verdade sobre o que entra.
2. Arquivar clones Lovable (não apagar ainda).
3. Portar SEFAZ + foto-de-foto + captura de comprovante no WhatsApp, um PR por peça.
4. Religar `reembolso.ia.br` no deploy do `tax`, não no Lovable.

Não fazer: subtree do monorepo inteiro, merge de schema Supabase no MySQL, segundo `package.json`.

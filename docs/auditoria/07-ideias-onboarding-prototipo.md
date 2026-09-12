# 07 · Ideias a absorver do protótipo `reembolso-inteligente-2ee7fd7d`

> Levantamento manual de 2026-09-12 a partir do README.md, DOCUMENTACAO.md,
> GUARDRAILS.md e READMEs internos (`src/lib`, `src/routes`) do protótipo.
> Deep research complementar em andamento (task ede07cbd).

## Por que este protótipo

É a variante mais completa da família Lovable (2.053 KB, a única com
`DOCUMENTACAO.md` e `GUARDRAILS.md`): TanStack Start + Lovable Cloud
(Postgres/Supabase), 54 testes em 8 arquivos, webhooks públicos,
multi-tenant com RLS.

## Ideias priorizadas para o `tax`

| # | Ideia | Origem no protótipo | Existe no `tax`? | Prioridade |
| --- | --- | --- | --- | --- |
| 1 | **Pipeline de compliance em 3 etapas** (triagem → SEFAZ → detecção de "foto de foto", com veredito consolidado) | `compliance.functions.ts` → `evaluateCompliance` | ❌ | 🔴 Alta |
| 2 | **Verificação de NF-e** — validação estrutural da chave (44 dígitos) + consulta de situação via nfe.io (SERPRO/SEFAZ) com link de conferência manual | `nfe.functions.ts`, `nfe-chave.ts` | ❌ | 🔴 Alta |
| 3 | **Guardrails como regras de negócio documentadas** | `GUARDRAILS.md` | ❌ | 🔴 Alta (baixo esforço) |
| 4 | **Idempotência de webhook** por `wa_message_id` (único por empresa) — evita duplicados de reenvio do WhatsApp | webhook `/api/public/evolution` | ❌ | 🟡 Média (baixo esforço) |
| 5 | **Convite em lote via CSV** de participantes | `participants-invite.functions.ts` → `inviteParticipantsBatch` | ❌ | 🟡 Média |
| 6 | **Rascunho de política por áudio/texto** (`draftPolicyFromInput` → revisão → `publishDraftPolicy`) | `policy.functions.ts` | Parcial (tax tem parser LLM de PDF) | 🟡 Média |
| 7 | **Health check diário** com cron (06h BRT) e alerta por e-mail ao admin | `health-check.server.ts` | ❌ | 🟢 Baixa |
| 8 | **Fila de e-mail com pgmq** (enqueue/batch/DLQ, throttle/TTL, opt-out) | `email_send_log/state`, `queue/process` | ❌ | 🟢 Baixa |
| 9 | **Fallback de modelos de IA** na leitura de comprovante (`gemini-3-flash-preview` → `gemini-2.5-pro`) + resposta automática pedindo foto mais nítida | webhook evolution, `ai-gateway.server.ts` | Parcial | 🟡 Média |

## Guardrails do protótipo (candidatos a política de engenharia do `tax`)

1. **Toda empresa nova nasce sem dados mock** — nenhum dado de demonstração
   no signup/convite/provisionamento.
2. **Convite por e-mail restrito ao domínio da empresa** (com exceções
   configuráveis).
3. **WhatsApp único por empresa em todo o sistema** — o número de um
   colaborador não pode se repetir em outra empresa.
4. **Nenhum dado de despesa/reembolso pode ser alterado manualmente** —
   toda informação tem origem em comprovante (imagem) e/ou documento fiscal.

## Práticas de segurança observadas (já alinhadas ou aportáveis)

- Papéis em tabela separada (`user_roles`) verificados por função
  `has_role()` — nunca confiar em papel vindo do cliente.
- `company_id` dos webhooks sempre resolvido no servidor, nunca aceito do
  corpo da requisição.
- Buckets de storage privados com política por pasta da empresa.
- Casos não resolvidos de webhook vão para tabela `webhook_debug`
  (observabilidade acionável).
- Falha no envio de e-mail de convite remove o usuário recém-criado
  (evita contas órfãs — relacionado a `fix/cadastro-sessao-orfas`).

## Notas de stack (não portar código diretamente)

O protótipo usa Supabase/RLS/pgmq e Lovable AI Gateway; o `tax` usa
Drizzle/MySQL + tRPC + Mistral/Gemini próprios. A absorção é de **ideias e
regras de negócio**, reescritas na stack do `tax` — não de código.

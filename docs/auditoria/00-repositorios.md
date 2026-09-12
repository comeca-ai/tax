# 00 · Repositórios comeca-ai — reembolso inteligente

> Curadoria estática (levantamento de 2026-09-12 via API do GitHub,
> ampliado com revisão manual de conteúdo no mesmo dia).
> Atualize manualmente quando surgir repo/branch novo no domínio.

## Inventário completo de repositórios do domínio

Dos 178 repositórios da conta `comeca-ai`, **11** tocam o domínio de
reembolso/fiscal:

| # | Repositório | Linguagem | Papel | Destino |
| --- | --- | --- | --- | --- |
| 1 | `comeca-ai/tax` | TypeScript | **Aplicação sólida (alvo de consolidação)** — tRPC + Drizzle/MySQL + React, OCR, WhatsApp, políticas, convites; 27 tags SemVer (v1.0.0 → v1.13.0) | **Base** |
| 2 | `comeca-ai/reembolso-inteligente-2ee7fd7d` | TypeScript | **Protótipo Lovable mais completo** — TanStack Start + Lovable Cloud, compliance 3 etapas, NF-e/SEFAZ, 54 testes, GUARDRAILS.md | **Absorver ideias** → depois arquivar (read-only) |
| 3 | `comeca-ai/reembolso-inteligente-8a2287f3` | TypeScript | Protótipo Lovable (público) — webhook de reembolso, onboarding por convite | Absorver ideias → referência read-only |
| 4 | `comeca-ai/fiscal` | JavaScript | **Produto separado** — Passaporte Fiscal + Rede de Créditos ICMS (Cloudflare Workers, Ed25519). NÃO é reembolso corporativo | **Manter separado** (ver `08-fiscal-passaporte.md`) |
| 5 | `comeca-ai/reembolso-inteligente` | TypeScript | Versão original dos protótipos Lovable (1.799 KB, sem DOCUMENTACAO.md) | Arquivar |
| 6 | `comeca-ai/reembolso-inteligente-0f414b11` | TypeScript | Clone idêntico do `8a2287f3` (mesmo bun.lock de 237.769 bytes) | Arquivar |
| 7 | `comeca-ai/reembolso-inteligente-62274548` | TypeScript | Clone idêntico do `8a2287f3` | Arquivar |
| 8 | `comeca-ai/reembolsaa` | JavaScript | App Base44 ("Reembolsaaí") — código gerado, deploy em vercel.app | Arquivar |
| 9 | `comeca-ai/reembolso1` | TypeScript | Template `create-next-app` padrão, sem código customizado (dez/2025) | Arquivar |
| 10 | `comeca-ai/meureembolsoapp` | Dockerfile | Só Dockerfile + README genérico (1 KB) | Arquivar |
| 11 | `comeca-ai/meufiscal` | TypeScript | Experimento fiscal anterior (dez/2025, parado) | Arquivar |

Repositório auxiliar: `comeca-ai/reembolsa_motor` (vazio, reservado ao
orquestrador — o orquestrador vive em `tools/orchestrator/` deste repo).

## Branches do `tax` organizadas por versionamento

| Branch | Versão relacionada | Tema | Complexidade de merge |
| --- | --- | --- | --- |
| `main` | ≈ v1.13.x (pós v1.13.0) | Linha estável | — |
| `feat/convergencia-1.7` | = tag `v1.13.0` (SHA `7e6667a`) | Convergência da linha 1.7 | Baixa (já integrada em tag) |
| `fix/cadastro-instrumenta-erro` | absorvida em `main` (v1.9.2) | Instrumentação de erro no cadastro | Baixa — **já consolidada** |
| `fix/cadastro-sessao-orfas` | absorvida em `main` (v1.9.2) | Sessões órfãs de cadastro | Baixa — **já consolidada** |
| `feat/onboarding-sem-veiculo` | pendente | Onboarding sem veículo | Baixa |
| `feat/escopo-regra-p0` | pendente | Escopo de regras P0 (políticas) | Média |
| `feat/policy-llm-gemini` | pendente | Motor de política com LLM (Gemini) | **Alta** — toca decisor/policy |
| `master` | pré-v1.0 | Linha antiga | **Arquivada** como `archive/master-pre-v1.0` (histórico preservado, sem merge) |

## Linha de versionamento do `tax`

```
v1.0.0 → v1.1.0 → v1.2.x → v1.3.0 → v1.4.x (7 patch) → v1.5.0 → v1.6.x (7 patch)
       → v1.7.0 → v1.9.0 (app-v1.9.2) → v1.10.0 → v1.12.0 → v1.13.0 (atual)
```

Observações:
- `v1.8.x` e `v1.11.x` não existem (saltos de numeração) — ver `CHANGELOG.md`.
- `feat/convergencia-1.7` coincide com a tag `v1.13.0`.

## Plano de consolidação (atualizado)

1. **Base**: `comeca-ai/tax` é a aplicação sólida — único repo com releases,
   testes (372), migrations e módulos completos.
2. **Absorver ideias** dos protótipos Lovable (principalmente
   `reembolso-inteligente-2ee7fd7d`) — ver `07-ideias-onboarding-prototipo.md`.
3. **Arquivar** os 8 repos redundantes/vazios listados acima (sem deletar
   nada — GitHub *Archive* preserva tudo read-only).
4. **`fiscal` permanece separado** — produto distinto (Passaporte Fiscal /
   crédito de ICMS), com possível integração futura documentada em
   `08-fiscal-passaporte.md`.
5. **Ordem de merge das branches pendentes**: `onboarding-sem-veiculo` →
   `escopo-regra-p0` → `policy-llm-gemini` (maior risco, por último).
   Fixes de cadastro já consolidados; `master` arquivada (não mergear).

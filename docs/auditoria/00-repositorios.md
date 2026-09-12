# 00 · Repositórios comeca-ai — reembolso inteligente

> Curadoria estática (levantamento de 2026-09-12 via API do GitHub).
> Atualize manualmente quando surgir repo/branch novo no domínio.

## Inventário de repositórios do domínio

Dos 178 repositórios da conta `comeca-ai`, 4 tocam o domínio de
reembolso/fiscal:

| Repositório | Linguagem | Papel | Versionamento | Branches | Complexidade |
| --- | --- | --- | --- | --- | --- |
| `comeca-ai/tax` | TypeScript | **Aplicação sólida (alvo de consolidação)** — app completo: tRPC + Drizzle/MySQL + React, OCR, WhatsApp, políticas, convites | SemVer ativo: **27 tags** (`v1.0.0` → `v1.13.0`, mais `app-v1.9.2`); `package.json` em `1.9.2` | 9 (ver abaixo) | **Alta** — 20 tabelas, 10 routers, módulos `fiscal`/`reembolso`, pipeline de briefs |
| `comeca-ai/reembolso-inteligente-8a2287f3` | TypeScript | Protótipo gerado (Lovable/gpt-engineer) — webhook público de reembolso, onboarding por convite | Sem tags; histórico de commits gerados ("Changes") | 1 (`main`) | **Baixa/Média** — código gerado, sem releases |
| `comeca-ai/meufiscal` | TypeScript | Experimento fiscal anterior (dez/2025, parado) | Sem tags | 1 (`main`) | **Baixa** — legado |
| `comeca-ai/reembolsa_motor` | — | Repositório novo reservado para o orquestrador | Sem tags; só "Initial commit" | 1 (`main`) | **Baixa** — vazio |

## Branches do `tax` organizadas por versionamento

`main` já absorveu a Fase 1 de cadastro (`596d0b5` e `6c549d4`); as
demais branches ainda divergem por feature:

| Branch | Versão relacionada | Tema | Complexidade de merge |
| --- | --- | --- | --- |
| `main` | ≈ v1.13.x (pós v1.13.0) | Linha estável | — |
| `copilot/organizar-reembolsos-estruturados` | = main | Esta consolidação/orquestrador | — |
| `feat/convergencia-1.7` | v1.7 → atual | Convergência da linha 1.7 (tag `v1.13.0` aponta para o mesmo SHA `7e6667a` desta branch) | Baixa (já integrada em tag) |
| `feat/escopo-regra-p0` | pendente | Escopo de regras P0 (políticas) | Média |
| `feat/onboarding-sem-veiculo` | pendente | Onboarding sem veículo | Baixa |
| `feat/policy-llm-gemini` | pendente | Motor de política com LLM (Gemini) | **Alta** — toca decisor/policy |
| `fix/cadastro-instrumenta-erro` | absorvida em `main` (v1.9.2) | Instrumentação de erro no cadastro | Baixa — já consolidada |
| `fix/cadastro-sessao-orfas` | absorvida em `main` (v1.9.2) | Sessões órfãs de cadastro | Baixa — já consolidada |
| `master` | pré-v1.0 | Linha antiga (anterior ao SemVer) | **Alta** — divergente, candidata a arquivar |

## Linha de versionamento do `tax`

```
v1.0.0 → v1.1.0 → v1.2.x → v1.3.0 → v1.4.x (7 patch) → v1.5.0 → v1.6.x (7 patch)
       → v1.7.0 → v1.9.0 (app-v1.9.2) → v1.10.0 → v1.12.0 → v1.13.0 (atual)
```

Observações:
- `v1.8.x` e `v1.11.x` não existem (saltos de numeração) — documentado em
  `CHANGELOG.md`.
- `feat/convergencia-1.7` coincide com a tag `v1.13.0` — já está
  materializada na linha principal.

## Proposta de consolidação (aplicação sólida única)

1. **Base**: `comeca-ai/tax` é a aplicação sólida — é o único repo com
   releases, testes, migrations e módulos completos (OCR, WhatsApp,
   políticas, convites).
2. **Absorver** do `reembolso-inteligente-8a2287f3`: apenas ideias de
   onboarding/convite que ainda não existam no `tax` (o restante é
   protótipo gerado, sem versionamento).
3. **Arquivar** `meufiscal` (legado parado desde dez/2025) e manter
   `reembolso-inteligente-8a2287f3` como referência read-only.
4. **Orquestrador**: vive em `tools/orchestrator/` do `tax` (este
   diretório) e publica relatórios em `docs/auditoria/`; o repo
   `reembolsa_motor` pode espelhar os relatórios se for mantido.
5. **Ordem de merge das branches pendentes**: Fase 1 (fixes de cadastro)
   já está consolidada em `main` (`fix/cadastro-instrumenta-erro` +
   `fix/cadastro-sessao-orfas`, release `v1.9.2`). Próximos merges:
   onboarding-sem-veiculo → escopo-regra-p0 → policy-llm-gemini (maior
   risco, por último). `master`: não fazer merge — arquivar.

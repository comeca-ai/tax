# Lista de ajustes — 17/09/2026

Levantada a partir da branch `feat/politica-ocr-paddle` (HEAD `fd39e20`, o mesmo
que a homologação roda desde `1.14.0-rc.20260917t205035z`), da auditoria
`docs/auditoria/2026-09-17-auditoria-politica-ocr-paddle.md` e dos achados
operacionais da homolog no mesmo dia. Esforço estimado ao lado de cada item.
Nada aqui declara entrega concluída; a matriz vigente continua em
[ENTREGAS-ATUAIS-2026-09-15.md](ENTREGAS-ATUAIS-2026-09-15.md).

## Contexto verificado

| Item | Valor | Fonte |
|---|---|---|
| Commits em 15 dias | 113 (507 arquivos, +52 074 / −2 430 linhas) | `git log --since="15 days ago"` |
| Homolog roda | `1.14.0-rc.20260917t205035z`, base `fd39e20`, 1002 testes | manifesto em `/var/backups/reembolsa-homolog/releases/` |
| CI remoto verificado | não (`remoteCiVerified: false`) | mesmo manifesto |
| Sidecar PaddleOCR | ativo em `127.0.0.1:4191`, motor 3.7.0 | `curl /health` |
| Distância das `main` | `novo-origin`/`pr`: +17 · `origin`: +22 / −4 | `git rev-list` |
| Fora do Git | auditoria de 17/09 e 4 pastas de evidência do navegador | `git status` |
| Provedores de LLM com crédito na homolog | nenhum (Mistral chat cota 0/min; OpenAI saldo esgotado) | teste de 17/09 |
| Worker 360dialog | desligado, 4 mensagens pendentes | registro de 15/09 |

## Melhorias de fundo (opinião)

1. **Uma `main` só.** Três `main` divergentes são a maior fonte de retrabalho: toda publicação, auditoria e PR começa com "contra qual base?".
2. **Publicar só o que o CI aprovou.** A homolog roda o HEAD local com o manifesto dizendo que o CI remoto não foi verificado.
3. **Menos documentos, mais um painel vivo.** 107 arquivos tocados em `docs/poc` em 15 dias; ninguém sabe o que está entregue sem ler cinco arquivos.
4. **Erro visível vira erro logado.** Disco não gravável e provedores sem crédito ficaram semanas atrás de "Falha interna" e "confiança baixa".
5. **Heurístico como caminho principal.** Com o classificador de tipo bem feito, a POC roda sem LLM pago no comprovante; a IA fica só para a política.
6. **Revisão humana antes de crescer os agentes.** 34 de 35 PRs sem review formal; agentes revisores sem leitor humano produzem relatório que ninguém lê.
7. **Decidir o recorte agora, não no ensaio.** Consulta fiscal externa, modos do painel e precedência hierárquica precisam de registro em `DECISOES.md`.
8. **Cota de testes externos por ambiente, não por conversa.** Contador no banco da homolog, visível no painel.

## Ajustes, na ordem de execução

### Hoje, sem esperar decisão

| # | Ajuste | Onde | Esforço |
|---|---|---|---|
| 1 | Classificador determinístico de `tipoDocumento` e `consumidorIdentificado` no caminho heurístico; recibo Pix, cartão e extrato viram `comprovante_pagamento` com `confiancaTipo` ≤ `media`; teste com recibo Pix via sidecar esperando `revisao_manual` (P0 da auditoria) | `api/modules/fiscal/ocr/index.ts`, `visao.ts`, decisor | meio dia |
| 2 | Commit da auditoria de 17/09 e das quatro pastas de evidência | `docs/auditoria/`, `docs/poc/evidencias/` | 10 min |
| 3 | `onError` no tRPC gravando causa e id de correlação no journal | `api/middleware.ts` | 1 h |
| 4 | Ping de saúde dos provedores (Mistral, OpenAI, sidecar) exposto na rota de saúde | rota de health da API | 2 h |
| 5 | Preflight rejeita `UPLOADS_DIR` legado; script de deploy antigo deixa de escrevê-lo | `tools/deploy/isolar-homolog.mjs:49`, `Relatorio/deploy-homolog-20260914.py:100` | 1 h |

### Esta semana, depois da escolha da `main`

| # | Ajuste | Onde | Esforço |
|---|---|---|---|
| 6 | Consolidar em uma `main`: tag nas outras duas, remoção dos remotes redundantes, PR de sincronização dos 4 commits só de `origin/main` | remotes, `docs/MAPA-REPOS.md` | 1 h + PR |
| 7 | Proteção de branch com uma aprovação obrigatória e CI verde | configuração do GitHub | 30 min |
| 8 | Script de publicação recusa commit sem run verde; manifesto grava o id do run e só então `remoteCiVerified: true` | `Relatorio/publicar-*.py`, `tools/deploy` | 2 h |
| 9 | Registro de decisão do recorte: consulta fiscal externa fora, modos do painel fora, precedência limitada ao que a política diz | `docs/DECISOES.md` | 30 min após aceite |
| 10 | ADR da cascata de OCR ampliada para comprovantes (P2 da auditoria) | `docs/DECISOES.md` | 30 min |
| 11 | Trava do sidecar com `lock.acquire(timeout=…)` → 503 `ocupado`; orçamento de páginas compatível com os 120 s (P1 da auditoria) | `services/paddle-ocr/server.py`, `api/lib/ocrLocal.ts` | 2 h |
| 12 | Variável própria para o upload em vez das duas semânticas de `POLICY_OPENROUTER_MAX_OUTPUT_TOKENS` (P1 da auditoria) | `policy/arquiteto.ts`, `policy/openrouter.ts`, `.env.example` | 1 h |

### Antes do ensaio final

| # | Ajuste | Onde | Esforço |
|---|---|---|---|
| 13 | Quadro único de entregas: uma linha por entrega com commit, data e prova; relatórios de responsabilidade viram histórico congelado em subpasta | `docs/poc/` | meio dia |
| 14 | Contador de chamadas pagas no banco da homolog, visível no painel, substituindo a cota que vive em documentos | banco + painel | meio dia |
| 15 | Examinar as quatro mensagens pendentes e só então religar o worker da 360dialog | homolog | 1 h |
| 16 | Criar os três agentes revisores (segurança e dados, cascata de OCR, CI e deploy) e rodá-los sobre o PR final como material da revisão humana | `/root/.claude/agents/` | 2 h + tokens |

Os itens 1 a 5 somam cerca de um dia e resolvem os dois problemas que ficaram
invisíveis por semanas.

## Recorte proposto para o escopo da POC

Mudança de escopo que exige aceite explícito.

- **Manter** o ciclo da decisão D-023: política validada com cargos e alçadas; equipe ativada pelo WhatsApp; foto do comprovante, extração e decisão devolvida; jornada de campo consolidada pelo Google Maps; nota de combustível no CNPJ do empregador; conciliação por período e cobrança documental; métricas e pagamento registrado; ensaio E12 com a piloto e aceite humano.
- **Deixar fora, com registro:** consulta fiscal externa (SEFAZ / NFE.io; o PDF de 07/09 já a excluía e D-025 permite o corte); modos do painel (adiados em 15/09); precedência entre superior, aprovador e analista além do que a política validada diz.

## Decisões que só o usuário pode tomar

1. Qual `main` recebe o PR: `novo-origin/main`, `pr/main` (mesmo commit) ou `origin/main`.
2. Crédito em um provedor (Mistral ou OpenAI) ou POC com a política extraída pelo heurístico e revisada à mão.
3. Aceite do recorte acima.

Página navegável com o mesmo conteúdo: https://claude.ai/artifact/MarNNqzKkNBfwuqVQma4eJ

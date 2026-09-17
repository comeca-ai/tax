# Pauta de melhorias — 17/09/2026

Consolidação, em um lugar só, de tudo o que está aberto sobre o reembolsa.ia
em 17/09/2026. Cada linha traz a origem, para que os documentos de origem
virem histórico e esta pauta seja a única lista viva **de melhorias e ajustes**.
O estado das entregas E1–E12 continua em ENTREGAS-ATUAIS até o item 14 o
substituir pelo quadro único.

Base: branch `feat/politica-ocr-paddle`, HEAD `0944438`, homolog em
`1.14.0-rc.20260917t205035z`.

**Fontes consolidadas**

| Sigla | Documento |
|---|---|
| S | [Sugestões de CEO — 17/09](SUGESTOES-CEO-2026-09-17.md) |
| LA | [Lista de ajustes — 17/09](poc/LISTA-DE-AJUSTES-2026-09-17.md) |
| A17 | [Auditoria da branch de OCR — 17/09](auditoria/2026-09-17-auditoria-politica-ocr-paddle.md) |
| A15 | [Auditoria integrada — 15/09](auditoria/2026-09-15-auditoria-integrada.md) |
| E | [Entregas atuais da POC — 15/09](poc/ENTREGAS-ATUAIS-2026-09-15.md) |

Esforços são os estimados nas fontes. Nada aqui declara entrega concluída.

---

## 0. Decisões que só o usuário toma

Sem estas, os blocos 2 e 4 não andam.

| # | Decisão | Sugestão registrada | Origem |
|---|---|---|---|
| D-a | Qual `main` recebe o PR: `origin`, `novo-origin` ou `pr` | `novo-origin/main` (`projeto_tribureembolsa`): a única protegida, CI completo, 0 commits atrás. Verificado na API em 17/09 | S-1, LA |
| D-b | Crédito em provedor de LLM ou política extraída pelo heurístico e revisada à mão | Crédito pequeno e fixo em um provedor, só para política | S-2, LA |
| D-c | Aceite do recorte: fiscal externo, modos do painel e precedência fora | Aceitar | S-3, LA |
| D-d | Identidade: motor tributário vira módulo do reembolsa ou repo próprio | Decidir e ajustar README | S-7 |
| D-e | A piloto continua engajada após 13/09? O que foi prometido? | Responder antes de ordenar o resto | S |

---

## 1. Hoje, sem esperar decisão

| # | Melhoria | Onde | Esforço | Origem |
|---|---|---|---|---|
| 1 | Classificador determinístico de `tipoDocumento` e `consumidorIdentificado` no heurístico; recibo Pix, cartão e extrato viram `comprovante_pagamento` com `confiancaTipo` ≤ `media`; teste com recibo Pix via sidecar esperando `revisao_manual`. **Bloqueia merge**: hoje um recibo Pix pode ser aprovado por regra de valor | `api/modules/fiscal/ocr/index.ts`, `visao.ts`, decisor | meio dia | A17 #1 (P0), LA 1 |
| 2 | Commitar a auditoria de 17/09, a pauta e as sugestões de CEO; decidir o destino das quatro pastas de evidência do navegador (não versionar dumps) | `docs/` | 10 min | LA 2, A17 #11 |
| 3 | `onError` do tRPC gravando causa e id de correlação no journal | `api/middleware.ts` | 1 h | LA 3 |
| 4 | Ping de saúde dos provedores (Mistral, OpenAI, sidecar) na rota de health | rota de health da API | 2 h | LA 4 |
| 5 | Preflight rejeita `UPLOADS_DIR` legado; script de deploy antigo deixa de escrevê-lo | `tools/deploy/isolar-homolog.mjs`, `Relatorio/deploy-homolog-20260914.py` | 1 h | LA 5 |

Itens 1 a 5 somam cerca de um dia e resolvem os dois problemas que ficaram
invisíveis por semanas (disco não gravável e provedores sem crédito).

---

## 2. Esta semana, depois da escolha da `main`

| # | Melhoria | Onde | Esforço | Origem |
|---|---|---|---|---|
| 6 | Consolidar em uma `main`: tag nas outras duas, remoção dos remotes redundantes, PR de sincronização do que só existe na `main` de `tax`; remover as 19 worktrees ligadas (14 em `/root`, 5 em `/tmp`) com `git worktree remove` e `git worktree prune`, nunca só `rm`, senão as branches ficam travadas em `.git/worktrees` | remotes, `docs/MAPA-REPOS.md`, `git worktree list` | 1 h + PR | S-1, LA 6 |
| 7 | Proteção de branch com uma aprovação obrigatória e CI verde | GitHub | 30 min | LA 7 |
| 8 | Publicação recusa commit sem run verde; manifesto grava o id do run e só então `remoteCiVerified: true` | `Relatorio/publicar-*.py`, `tools/deploy` | 2 h | LA 8 |
| 9 | Registrar em `DECISOES.md` o recorte aceito (D-c) | `docs/DECISOES.md` | 30 min | LA 9 |
| 10 | ADR da cascata de OCR ampliada para comprovantes e do OpenRouter no upload (D-026) | `docs/DECISOES.md` | 30 min | A17 #4, LA 10 |
| 11 | Sidecar: `lock.acquire(timeout=…)` → 503 `ocupado`; orçamento de páginas compatível com os 120 s | `services/paddle-ocr/server.py`, `api/lib/ocrLocal.ts` | 2 h | A17 #2 (P1), LA 11 |
| 12 | Env própria para o upload no lugar das duas semânticas de `POLICY_OPENROUTER_MAX_OUTPUT_TOKENS` | `policy/arquiteto.ts`, `policy/openrouter.ts`, `.env.example` | 1 h | A17 #3 (P1), LA 12 |
| 13 | Congelar a cascata de quatro provedores: nenhum trabalho novo nela até o ciclo do bloco 4 fechar | processo | 0 | S-2 |

---

## 3. Antes do ensaio final (E12)

| # | Melhoria | Onde | Esforço | Origem |
|---|---|---|---|---|
| 14 | Quadro único de entregas: uma linha por entrega com commit, data e prova; relatórios de responsabilidade e revisões datadas viram histórico congelado em subpasta; nenhum markdown novo em `docs/poc` fora do quadro | `docs/poc/` | meio dia | S-5, LA 13 |
| 15 | Contador de chamadas pagas no banco da homolog, visível no painel, substituindo a cota que vive em documentos | banco + painel | meio dia | LA 14 |
| 16 | Examinar as quatro mensagens pendentes e só então religar o worker da 360dialog | homolog | 1 h | LA 15 |
| 17 | Revalidar configuração e saldo da piloto na 360dialog antes do ensaio | homolog | 30 min | E |
| 18 | Ensaio E12 com a piloto: E1–E11 aplicáveis, bloqueios, reversão e aceite humano registrados | homolog | 1 dia | E |

---

## 4. Direção (sugestões de CEO)

| # | Melhoria | Critério de pronto | Origem |
|---|---|---|---|
| 19 | Congelar o escopo no menor ciclo tocável: foto no WhatsApp → extração → decisão → resposta citando a regra. Uma semana. Nada mais entra na `main` até rodar | Ciclo executado na homolog com o número da piloto, evidência de entrada e saída | S-4 |
| 20 | Pausar esteira, agentes revisores e pipeline v3.x até E12 ter data. Exceção: os três revisores do LA 16 só se houver leitor humano do relatório | Nenhum PR de agentes/pipeline até E12 datado | S-6, LA 16 |
| 21 | Identidade do produto: README e `PRODUTO.md` coerentes com a decisão D-d | README não vende recuperação tributária como produto principal se o produto é reembolso | S-7 |

---

## 5. Backlog técnico (P2 e P3 da auditoria de 17/09)

Corrigir na branch ou abrir issue nomeada. Não bloqueiam merge.

| # | Melhoria | Onde | Origem |
|---|---|---|---|
| 22 | Sincronizar configuração e docs operacionais: cascata, valores de `POLICY_PROVIDER`, `OCR_LOCAL_COMPLEMENTAR_IA`, limites de memória, interpretador fora de `/root` | `.env.example`, `.env.docker.example`, `docker-compose.yml`, `services/paddle-ocr/README.md`, unit do systemd | A17 #5 |
| 23 | CHANGELOG das duas seções novas com impacto e rollback | `CHANGELOG.md` | A17 #6 |
| 24 | Deduplicar `comTimeout` (4 cópias), `modelosOpenRouter` e a lista de campos essenciais em `api/lib/` | `api/lib/ia/comTimeout.ts` e chamadores | A17 #7 |
| 25 | Testes reais nos ramos novos: `POLICY_PROVIDER=mistral-ocr` com texto local usando `original`; asserts de `tipoDocumento` | `policy/mistral.ts`, `parser.ts`, `visao.ocrLocal.test.ts` | A17 #8 |
| 26 | Sidecar: clamp de pixmap, timeout de socket no handler, `compare_digest` com bytes | `services/paddle-ocr/server.py` | A17 #9 |
| 27 | Documentar `POLICY_PROVIDER=mistral-ocr` como diagnóstico; não usar em homolog | `policy/parser.ts`, docs | A17 #10 |
| 28 | Teste de igualdade entre `UNIDADES_LIMITE`/`REEMBOLSAVEL_REGRA` em `schemaRuleset.ts`, `contracts/types.ts` e o prompt | testes | A17 sugestões |
| 29 | `logarErroInterno` não deve embutir corpo de resposta de provedor em `cause` | `api/boot.ts` e quem lança `TRPCError` | A17 sugestões |

---

## 6. Dívidas de entrega da POC ainda abertas (E1–E12)

Estado de 15/09; a matriz vigente segue em ENTREGAS-ATUAIS. Só o que ainda
falta provar.

| Entrega | Falta | Origem |
|---|---|---|
| E1 modos por empresa | Adiada por decisão do usuário (recorte D-c) | E, A15 |
| E2 fila e delegação | Precedência superior/aprovador/analista limitada ao que a política diz (D-c); ensaio de perfis em homolog | E |
| E3 parâmetros | Caso em que cada parâmetro editado altera a decisão | E, A15 A6 |
| E4 veículo e combustível | Jornada, veículo, consumo, km e divergência >15% demonstrados juntos | E |
| E5 equipe e hierarquia | Importação, convite, aceite e encaminhamento pelo superior em homolog | E |
| E6 métricas e pagamento | Régua por empresa/período, amostra, tempo até pagamento, ato manual auditável | E |
| E7 chave fiscal | Documento real, chave persistida, validação estrutural | E |
| E8 consulta fiscal | Fora do recorte (D-c) | E, S-3 |
| E9 duplicidade | Reenvio entre painel/WhatsApp, mesma chave em arquivos diferentes, duplicados históricos | E |
| E10 WhatsApp | Foto, extração, decisão, resposta e rastreio em homolog (é o ciclo do item 19) | E |
| E11 checkpoints | Jornada real com Maps publicada; validação de arquivo no backend web (A5) | E, A15 A5 |
| E12 ensaio | Item 18 | E |

---

## 7. Já resolvido, não retrabalhar

- A1 (modo sombra/assistido no painel), A2 (aprovação separada da confirmação fiscal) e A3 (despesa duplicada por upload) foram corrigidos em 15/09 com testes focados. Falta só a prova SQL real dos locks. (A15)
- `UPLOADS_DIR` não gravável e provedores sem crédito já foram diagnosticados; o que resta é o item 5 e a decisão D-b. (LA)
- `onError` do tRPC já loga no servidor desde `66e377a`; o item 3 acrescenta id de correlação.

## 8. O que não fazer agora

- Não resolver o item 1 chamando a IA de visão quando faltar `tipoDocumento`. (A17)
- Não devolver o chat da Mistral à cascata só porque o `.env.example` o descreve. (A17)
- Não unificar `HeuristicOcrProvider` e `HeuristicPolicyParser`: são dois motores por D-014. (A17)
- Não criar documento novo em `docs/poc` fora do quadro único do item 14. (S-5)
- Não iniciar consulta fiscal externa, modos do painel ou precedência ampliada antes da decisão D-c. (S-3)

## Como esta pauta evolui

Item concluído recebe commit e data na própria linha. Item recusado recebe o
motivo. Quando o bloco 1 fechar, o bloco 2 sobe; quando E12 tiver data, o bloco
4 é revisto. As fontes listadas no topo não são mais atualizadas com itens
novos: entram aqui.

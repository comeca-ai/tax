# Sugestões de CEO — 17/09/2026

Registro das sugestões de direção levantadas em 17/09/2026 a partir da leitura
do repositório (`feat/politica-ocr-paddle`, HEAD `0944438`), da
[lista de ajustes de 17/09](poc/LISTA-DE-AJUSTES-2026-09-17.md) e da
[auditoria integrada de 15/09](auditoria/2026-09-15-auditoria-integrada.md).
São **sugestões**, não decisões: cada item vira entrada em
[DECISOES.md](DECISOES.md) só depois de aceite explícito do usuário.

> Consolidado na [pauta de melhorias de 17/09](PAUTA-DE-MELHORIAS-2026-09-17.md):
> S-1 → item 6, S-2 → item 13, S-3 → item 9, S-4 → item 19, S-5 → item 14,
> S-6 → item 20, S-7 → item 21; as decisões pendentes são D-a a D-e lá.
> A pauta é a lista viva; este arquivo é o registro da proposta.

## Diagnóstico em uma linha

O problema não é capacidade técnica. É máquina de processo maior que o
produto: o repositório produz governança sobre si mesmo mais rápido do que
produz um ciclo que a empresa piloto consiga tocar.

## Sinais verificados

| Sinal | Valor | Fonte |
|---|---|---|
| Commits em 15 dias | 113 (+52 074 linhas) | `git log --since="15 days ago"` |
| Aceite comprovado da POC | 0 de 12 | [ENTREGAS-ATUAIS-2026-09-15.md](poc/ENTREGAS-ATUAIS-2026-09-15.md) |
| Prazo de 13/09 | perdido, sem nova data assumida | mesmo documento |
| Arquivos `.md` em `docs/` | 86 (107 tocados em `docs/poc` em 15 dias) | `find docs -name "*.md"` |
| PRs sem review formal | 34 de 35 | [REVALIDACAO-GITHUB-2026-09-15.md](poc/REVALIDACAO-GITHUB-2026-09-15.md) |
| Branches `main` divergentes | 3 (`origin`, `novo-origin`, `pr`) | lista de ajustes de 17/09 |
| Crédito em provedor de LLM na homolog | nenhum | teste de 17/09 |
| Worker 360dialog | desligado, 4 mensagens pendentes | registro de 15/09 |
| Worktrees ligadas ao repositório | 19 (14 em `/root`, 5 em `/tmp`) | `git worktree list` |

O que existe de verdade: motor fiscal determinístico com testes, política
versionada com revisão humana, fila de aprovação transacional, OCR local
funcionando. Não é protótipo. O que falta é conseguir dizer, sem ler cinco
arquivos, o que está entregue, e fechar um ciclo ponta a ponta.

Identidade dupla: o README vende recuperação tributária; o contrato da POC, as
doze entregas e todo o trabalho recente são reembolso de despesas por WhatsApp.

## Sugestões

As três primeiras são as decisões que a lista de 17/09 deixou em aberto. As
quatro seguintes são direção.

### S-1 · Uma `main` só

Ficar com a `main` de `comeca-ai/projeto_tribureembolsa` (remoto `novo-origin`):
é a única protegida, tem 13 workflows de CI ativos, as deploy keys apontam para
ela e a branch atual está 0 commits atrás dela. A `main` de `comeca-ai/tax`
(remoto `origin`) não tem proteção. Verificado na API em 17/09.
Criar tag nas outras duas, remover os remotes
redundantes, remover as 19 worktrees ligadas com `git worktree remove` e
`git worktree prune`. Atualizar
[MAPA-REPOS.md](MAPA-REPOS.md).

### S-2 · Heurístico como caminho principal no comprovante

O comprovante roda sem LLM pago (OCR local + heurístico + revisão manual).
Crédito pequeno e fixo em **um** provedor, só para a extração da política. A
cascata de quatro provedores não recebe mais trabalho até o ciclo da S-4
fechar.

### S-3 · Aceitar o recorte da POC

Fora, com registro em DECISOES.md: consulta fiscal externa (SEFAZ / NFE.io),
modos do painel, precedência entre superior, aprovador e analista além do que
a política validada diz.

### S-4 · Congelar o escopo no menor ciclo tocável

Foto no WhatsApp → extração → decisão → resposta citando a regra. Prazo de uma
semana. Nada mais entra na `main` até isso rodar na homolog com o número da
piloto.

### S-5 · Congelar a documentação

Nenhum markdown novo em `docs/poc`. Um único quadro vivo de entregas, uma
linha por entrega com commit, data e prova. Relatórios de responsabilidade e
revisões datadas vão para uma subpasta de histórico congelado.

### S-6 · Pausar o investimento em orquestração de agentes

Esteira, agentes revisores e pipeline v3.x ficam parados até o ensaio E12 ter
data. Agente revisor sem leitor humano produz relatório que ninguém lê.

### S-7 · Decidir a identidade do produto

Ou o motor tributário vira módulo do reembolsa.ia, ou vira outro repositório.
O README atual engana quem chega. Ajustar README e [PRODUTO.md](PRODUTO.md)
conforme a escolha.

## A pergunta que o repositório não responde

A empresa piloto continua engajada depois do prazo perdido de 13/09, e o que
exatamente foi prometido a ela? Se a piloto esfriou, a prioridade número um
passa a ser comercial, não técnica, e a ordem das sugestões acima muda.

## Como este documento evolui

Sugestão aceita vira uma decisão D-0xx em [DECISOES.md](DECISOES.md) e o
item correspondente da pauta recebe o link. Sugestão recusada recebe o motivo
na pauta. Este arquivo não muda mais e não declara entrega concluída.

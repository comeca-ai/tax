# Auditoria recebida × GitHub atual — 15/09/2026

Consulta autenticada somente de leitura às **06:39 UTC**. Repositório:
`comeca-ai/projeto_tribureembolsa`, main
[`7f11af7`](https://github.com/comeca-ai/projeto_tribureembolsa/commit/7f11af74e0846e7c1868f9719366f5b5e6f3fbb6).
Responsável pela conferência e pelo fechamento técnico: **Codex**.

**A governança de revisão continua sem ser cumprida de forma consistente.**
34 das 35 PRs mescladas examinadas não possuem review formal; 23 foram mescladas
em menos de dez minutos. A proteção da main exige o check de qualidade, mas zero
aprovações. Assumo a responsabilidade por consolidar as correções e comprovar
revisão e validação antes de apresentar nova entrega como concluída. Os números
não identificam, por si, qual pessoa ou agente executou cada merge.

## Resultado do confronto

| Item recebido | Estado confirmado agora | Conclusão |
|---|---|---|
| “21/21 PRs sem review” | 34/35 na amostra atual; #50 tem uma aprovação formal | Falha de processo confirmada; contagem atualizada. |
| “Template vazio em #36/#37/#41” | #36/#37 conservam instruções de template e zero checkboxes marcados; #41 tem seis marcados e corpo preenchido | Problema histórico confirmado em #36/#37; afirmação sobre #41 superada. |
| “PR #41 draft” | Integrada em 13/09 às 15:33 UTC | Estado superado. |
| PR #36 mistura documentação e automação | 45 arquivos, 2.986 adições e workflows no conjunto, título “Docs/360dialog canal unico” | Escopo mal comunicado; requer disciplina de revisão. |
| “19 branches órfãs” | 28 além da main; 26 sem proteção têm SHA de head de PR já mesclada | Candidatas à limpeza; não presumir que são descartáveis. Exclusão automática desligada. |
| “README aponta para tax.git, pastas antigas e senha fixa de seed” | URL antiga, api/engine/, api/ocr/ e padrões de senha examinados não aparecem na main atual | Esses indicadores foram corrigidos; não prova revogação de credenciais antigas. |
| “Evolution como default” | O padrão atual é `dialog360` | Afirmação superada para a main examinada. |
| package.json de scaffold | `my-app`; private=true; sem engines, repository e license | Pendente de ajuste e definição de licença. |
| Dependabot sem npm | Apenas configuração de Actions detectada, sem npm | Confirmado. |
| CODEOWNERS, SECURITY e LICENSE | Ausentes nos caminhos raiz/.github examinados | Confirmado no recorte. |
| Squash não exclusivo | Merge commit, squash e rebase permitidos | Confirmado; configuração deve refletir o processo acordado. |
| Releases vazias | Nenhuma Release retornada | Confirmado; não equivale a ausência de tags. |
| Secret scanning / push protection | `security_and_analysis` não foi retornado | Indeterminado; não declarar habilitado nem desabilitado. |
| Revisão automática via ruleset | Lista de rulesets retornada vazia | Não há regra desse tipo comprovada pela consulta. |
| Auditoria de duas em duas horas | Nenhum workflow dedicado localizado na árvore examinada | Entrega ainda sem comprovação. O coletor do painel não substitui essa auditoria. |

## PRs verificadas em detalhe

| PR | Reviews formais | Tempo entre abertura e merge | Limite |
|---|---:|---:|---|
| [#17](https://github.com/comeca-ai/projeto_tribureembolsa/pull/17) | 0 | 128,3 min | Corpo com quatro checkboxes marcados; a exigência de segunda revisão permanece sem review formal registrada. |
| [#36](https://github.com/comeca-ai/projeto_tribureembolsa/pull/36) | 0 | 25,1 min | Título de docs, workflows no conjunto e instruções de template preservadas. |
| [#37](https://github.com/comeca-ai/projeto_tribureembolsa/pull/37) | 0 | 2,4 min | Título fora do padrão e instruções de template preservadas. |
| [#41](https://github.com/comeca-ai/projeto_tribureembolsa/pull/41) | 0 | 96 min | Já integrada, título convencional e seis checkboxes marcados. |
| [#54](https://github.com/comeca-ai/projeto_tribureembolsa/pull/54) | 0 | 1,9 min | Corpo não vazio; ausência de checkbox não basta para afirmar template vazio. |

## Dívidas de governança sob acompanhamento de Codex

1. Garantir revisão rastreável nas próximas mudanças e registrar o alcance de
   revisão automática e humana sem tratá-las como equivalentes.
2. Preparar ajustes de metadados, Dependabot npm, instruções de segurança e
   responsáveis por áreas; a licença exige definição do proprietário.
3. Documentar e propor configurações coerentes de merge/proteção, tratando
   exclusão de branches caso a caso e preservando referências necessárias.
4. Preparar auditoria periódica objetiva com relatório único e revisão,
   diferenciando execução bem-sucedida, revisão e correção dos achados.
5. Encerrar o inventário/revogação de credenciais antigas com evidência
   operacional, sem registrar seus valores.
6. Ligar Releases a commits e artefatos aprovados, sem inventar aceite para
   versões existentes.

Estas ações complementam as 12 entregas e os seis compromissos funcionais; não
substituem E12. Não foi assumido novo prazo de fechamento. Esta conferência
não alterou configurações, branches, releases, revisores ou credenciais.

## Método e limites

GET de metadados do repositório, main/proteção, rulesets, até 100 PRs/branches/
releases, até 100 reviews por PR e arquivos fixados no SHA da main. Os 35 PRs
retornados estavam mesclados. Nenhuma review foi inferida de CI, comentário de
conversa ou autoria do commit. Detectores de template e README são limitados
aos padrões indicados; não representam análise semântica completa.

O trecho recebido sobre `ultravis_GEO` não foi revalidado nem misturado aos
números da POC Reembolsa. Não houve exploração, consulta a provedores,
inspeção de produção ou recuperação de valores de secrets nesta conferência.

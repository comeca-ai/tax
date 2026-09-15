# Entregas atuais da POC — dívidas e compromissos

Atualizado em 15/09/2026. Responsável técnico: Codex.

**Responsabilidade assumida:** o compromisso de integração completa para 13/09
às 18h não foi cumprido. A execução técnica e a prestação de contas continuam
sob responsabilidade de Codex. Aceite integral comprovado: 0/12.

Esta é a lista vigente para conduzir a POC. Ela separa implementação local,
homologação publicada e aceite humano. Os documentos anteriores permanecem como
histórico; não devem ser usados para afirmar que um item abaixo foi encerrado.

## Situação verificável

- Último registro de homologação: `1.14.0-rc.20260915t000927z`, base `7f11af7`, consultado às 06:56 UTC; não reconsultado nesta retomada.
- Candidata consolidada: `97180f5fdcf136e24e13eb1eec25d07715119771`, enviada na branch `integrate/poc-candidata-20260915`; ainda não homologada.
- Validação atual: 959 testes gerais aprovados e 55 ignorados; 58 SQL aprovados e zero ignorados, em suíte separada com sobreposição. TypeScript, lint e build aprovados.
- Oito cenários específicos de checkpoints e oito do build real passaram no navegador com dados sintéticos. Isso não comprova provedores, CI remoto ou aceite.
- Os modos web adiados foram retirados em `5a24ece`; permanecem fora desta entrega.
- Condições textuais, concorrência de versões e revalidação de autoridade foram integradas e testadas.

Registro histórico da consulta remota anterior (não descreve a branch já enviada nesta retomada):

Consulta autenticada do GitHub em **15/09/2026 às 06:35 UTC**: a
[main 7f11af7](https://github.com/comeca-ai/projeto_tribureembolsa/commit/7f11af74e0846e7c1868f9719366f5b5e6f3fbb6)
está protegida, a [PR #54](https://github.com/comeca-ai/projeto_tribureembolsa/pull/54)
foi integrada e os CIs
[Qualidade](https://github.com/comeca-ai/projeto_tribureembolsa/actions/runs/34911483621)
e [Jampeiro](https://github.com/comeca-ai/projeto_tribureembolsa/actions/runs/34911483744)
passaram para esse commit. Os commits `698ccd8`, `0d743d0`, `c4b5e89` e
`edd3422` não foram resolvidos pelo GitHub; a branch de fechamento retornou 404
na consulta autenticada. Os 885 testes são do registro local de `c4b5e89`,
executado às 05:55 UTC; não são contagens de CI nem validação remota.

## Dívidas já assumidas

| Entrega | Estado atual | Evidência necessária para encerrar |
|---|---|---|
| E1 — modos por empresa | Adiada no painel por decisão do usuário; mudança retirada do diff final em `5a24ece`. | Execução nos três modos, promoção e reversão quando o usuário retomar o item. |
| E2 — fila, aprovação e delegação | Parcial. Há fila e designações; precedência entre superior, aprovador e analista não está comprovada. | Ensaio de perfis, delegação, auditoria e decisão persistida em homologação. |
| E3 — parâmetros | Parcial. Tarifas e parâmetros são persistidos; benefícios não têm efeito integrado comprovado no decisor. | Caso em que a edição de cada parâmetro altera a decisão correta. |
| E4 — veículo e combustível | Parcial. Cadastro e validações existem. | Jornada, veículo, consumo, quilometragem e divergência maior que 15% demonstrados juntos. |
| E5 — equipe e hierarquia | Parcial. CSV com prévia e convites existem. | Importação, correção, convite, aceite e encaminhamento pelo superior em homologação. |
| E6 — métricas e pagamento | Incompleta. | Régua por empresa/período, amostra, tempo até pagamento e ato manual auditável. |
| E7 — chave fiscal e comprovantes | Parcial. Extração XML/texto implementada; validação web reforçada em commit local. | Documento elegível real, chave persistida, qualidade de extração e validação estrutural dos arquivos. Conferir prefixo de XML não comprova XML fiscal válido. |
| E8 — consulta fiscal | Parcial. Adaptador cobre NF-e modelo 55; NFC-e 65 e NFS-e permanecem fora do adaptador atual. | Consulta autorizada de documento suportado, protocolo/resultados auditáveis e regra para modelos fora de cobertura. |
| E9 — integridade e duplicidade | Parcial. Bloqueio por hash/chave existe localmente; validação web foi reforçada. | Concorrência, reenvio entre painel/WhatsApp, arquivos diferentes com a mesma chave, manipulação e conciliação de duplicados históricos. |
| E10 — WhatsApp | Parcial. Há registro anterior de recebimento e confirmação curta. | Foto, extração, decisão, resposta positiva/negativa e rastreio de entrada/saída em homologação. |
| E11 — checkpoints e campo | Parcial. `0d743d0` inclui presenças sem jornada e evita contagem duplicada; 21 testes focados passaram. | Publicação e jornada real com Maps. Oito cenários específicos locais de navegação/carregamento/erro/troca de empresa passaram. |
| E12 — ensaio integral | Não entregue. | Executar E1–E11 aplicáveis com empresa piloto, registrar bloqueios, reversão e aceite humano. |

## Novos compromissos de execução

| Ordem | Compromisso | Condição objetiva de conclusão |
|---|---|---|
| 1 | Preparar publicação revisável sem o modo do painel adiado. | Recorte concluído na candidata; revisão remota e CI da versão final ainda pendentes. |
| 2 | Publicar checkpoints e validação de arquivos somente após CI. | SHA/manifesto da homologação corresponde ao commit revisado. |
| 3 | Executar os cenários específicos de checkpoints. | Evidência de link direto, carregamento, erro/retry e troca de empresa. |
| 4 | Fechar duplicidade e fiscal sem chamadas pagas não autorizadas. | Testes de persistência/conflito e documento elegível para consulta. |
| 5 | Atualizar o painel e esta matriz após cada versão. | Fonte, commit, data de teste e limite de cada evidência são consistentes. |
| 6 | Conduzir E12 quando os pré-requisitos estiverem homologados. | Dossiê do piloto e aceite humano; sem isso, a POC segue parcial. |

Responsável por todos os compromissos acima: **Codex**. O prazo anterior está
descumprido; nenhuma nova data final foi assumida nesta revisão. Os seis itens
organizam a execução do trabalho já devido, sem apagar os compromissos anteriores.
Os modos adiados no painel continuam fora da prioridade imediata; seu adiamento
não equivale a aceite integral de E1 ou E12.

## Falhas assumidas e ações de encerramento

| Falha | Impacto | Ação devida por Codex |
|---|---|---|
| Prometer integração completa e não cumprir o prazo | Piloto sem entrega integral no horário combinado | Fechar as lacunas, publicar versão revisada e demonstrar o fluxo. |
| Prometer mobilização e consolidação sem encerrar a entrega | Trabalho fragmentado e correções permanecendo locais | Consolidar versão, testes, documentação e publicação. |
| Chamar oito verificações gerais de testes de checkpoints | Evidência insuficiente apresentada como específica | Executar link direto, carregamento, erro/retry e troca de empresa no navegador. |
| Dizer que DNS era o único bloqueio | Problemas funcionais omitidos da conclusão | Registrar separadamente limitação de ferramenta e falhas da aplicação. |
| Deixar candidata com problemas fiscais, duplicidade e checkpoints | Estados incorretos ou divergentes e revisão adicional | Validar as correções locais no banco e na versão publicada. |
| Manter relatórios e contagens desatualizados | Dificuldade de identificar o que realmente está entregue | Sincronizar a matriz e o painel com data, commit e fonte de cada prova. |

Registro detalhado: [Responsabilidade atual](RESPONSABILIDADE-ATUAL-2026-09-15.md).

Auditoria de governança recebida e revalidada às 06:39 UTC:
[34/35 PRs sem review formal, zero aprovações obrigatórias e pendências de organização](REVALIDACAO-GITHUB-2026-09-15.md).
As dívidas de governança e a automação de auditoria de duas em duas horas
continuam sob acompanhamento de Codex, sem novo prazo final assumido.

## Itens externos ou que exigem decisão

- Revalidar configuração e saldo do piloto antes do ensaio. O histórico já
  registra autorização do canal, correção do webhook e resposta entregue/lida;
  esses fatos não devem voltar a ser descritos como nunca realizados.
- Usar documento elegível e saldo dentro das autorizações existentes: há
  registro de teto compartilhado de 100 chamadas e teto separado de 20 NFE.io.
  Os saldos atuais não foram consultados; ampliação de custo ou finalidade exige
  nova autorização. A mesma autorização não será solicitada novamente.
- Cobertura desejada para NFC-e 65/NFS-e e regra de negócio para seus resultados.
- Critério de precedência entre superior, aprovador e analista.
- Retomada explícita dos modos no painel.

Nenhum item desta lista autoriza promoção para produção. Produção só pode ser
considerada após revisão, CI, homologação, ensaio E12 e aceite humano.

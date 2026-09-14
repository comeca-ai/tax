# Revisão das entregas e compromissos — 14/09/2026

**Atualização operacional de 14/09 às 12:02 UTC:** consulte [liberação para teste e prestação de contas](LIBERACAO-E-COMPROMISSOS-2026-09-14.md). Acesso web, versão e autenticação foram reconferidos. As seções abaixo preservam o histórico; a POC integral permanece sem aceite.

Esta revisão prevalece sobre os balanços de 13/09 para os pontos explicitamente atualizados. Responsável: Codex, agente executor de IA.

## Onde paramos

A entrega integral prometida para 13/09 não foi demonstrada no prazo. **0 de 12 entregas tem todas as condições comuns de aceite comprovadas.** Nove possuem implementação parcial; E5, E8 e E12 não atendem ao resultado prometido. As 17 tarefas do roadmap detalham o mesmo escopo.

Base de trabalho: `feat/poc-homologacao-integrada`, commit `1eab6fee72cbe65985383a3b917e1bed321610a2`, com alterações locais ainda sem commit. Nenhuma dessas correções é apresentada como release instalada.

## O que foi conferido nesta retomada

- Suíte atual: **731 testes passaram, zero falhas, 16 ignorados**. Tipos, lint e build passaram. Avisos de tamanho de bundle permanecem.
- **19 testes SQL passaram, zero falhas e zero ignorados** no banco local descartável, após as migrações 0018/0019. Incluem isolamento, vínculos ativos, três modos, duplicidade e autenticação/revogação. As contagens da suíte geral e SQL se sobrepõem e não devem ser somadas.
- Serviços `reembolsa.service` e `reembolsa-homolog.service`: ativos. Diretórios instalados sem metadados Git; a versão imutável em execução não foi confirmada.
- O painel público respondeu HTTP 200. O timer de atualização a cada 30 minutos está ativo, com última execução bem-sucedida. Ele apenas relê os documentos: não implementa funcionalidades nem executa auditoria.
- PRs, CI remoto atual, credenciais dos provedores, recebimento real e aceite do usuário não foram revalidados nesta rodada.

## Compromissos revisados

| Compromisso | Situação e obrigação restante |
| --- | --- |
| Entregar a POC completa no prazo anunciado | Não cumprido. E12 ainda depende de E1–E11 e evidências reais. |
| Publicar todos os relatórios e explicar o andamento | Catálogo ampliado nesta rodada, incluindo segurança, auditorias, critérios das 17 tarefas e acesso à análise K2/PDF/Word/planilha. Verificação externa ao final da publicação. |
| Atualizar o painel a cada 30 minutos | Timer verificado ativo. Coleta documental automática não é revisão técnica. |
| Auditoria automática a cada duas horas e revisão automática | Não há comprovação de agendamento e execução que satisfaça o combinado. Continua pendente. |
| Corrigir segurança e isolamento | S1–S5, S9 e S10 têm correções locais e testes; S6/S8 já tinham correções locais. Falta validação operacional, tratamento S7/S11/S12 e release revisada. |
| Produção somente estável, testada e versionada | Mantido como critério de publicação do software: PR, CI, revisão, versão imutável, homologação e reversão. Serviços ativos não comprovam esse processo. |
| Canal exclusivo 360dialog | Documentado e implementado como padrão. Fluxo real foto → decisão → resposta ainda sem demonstração completa. |
| Avisar na hora do teste com seu número | Ainda não chegou o marco: homologação ponta a ponta não está pronta. |
| Banco privado com preparação para S3/R2 | Adapter e metadados previstos; migração para armazenamento externo não foi executada. |
| Respeitar limites de consultas externas | Nesta revisão não foram feitas chamadas pagas a provedores. O limite anterior de 20 chamadas exige conferência do saldo antes de novos ensaios. |
| Hierarquia, combustível, Maps, métricas e transferência operacional | Critérios preservados no escopo completo; testes de módulos isolados não encerram esses compromissos. |

## Entregas e sequência de fechamento

| Entrega | Estado | Falta para fechar |
| --- | --- | --- |
| E1 modos | Parcial | Demonstrar os efeitos nos caminhos integrados e promoção/reversão. |
| E2 revisão | Parcial | Correções locais de vínculo/revisor existem; falta prova final API+banco e homologação. |
| E3 configuração | Parcial | Consumo integral de parâmetros pelo decisor e ensaio na tela. |
| E4 veículo | Parcial | Conciliação do legado e alimentação da apuração fiscal. |
| E5 equipe em lote | Não atende ao prometido | Prévia sem escrita, erros por linha, vínculos CLT/MEI/PJ, superior e confirmação de convites. |
| E6 métricas | Parcial | Cinco dimensões por empresa/período, amostra e estado paga auditado. |
| E7 chave fiscal | Parcial | Persistência universal e extração comprovada em documentos reais autorizados. |
| E8 fisco | Não atende ao prometido | Consulta no envio, evidência anexada e degradação/revisão explícitas. |
| E9 antifraude | Parcial | Duplicidade semântica, manipulação e amostra rotulada com falso positivo. |
| E10 WhatsApp | Parcial | Foto e resposta reais no canal homologado, incluindo identidade e regra citada. |
| E11 campo | Parcial | Jornada real, rota, memorial e ponte ao cálculo fiscal. |
| E12 ensaio | Não entregue | Roteiro completo com dados autorizados, três modos, reversão e zero bloqueantes. |

A execução continua pelas correções e provas técnicas, integração das funcionalidades ausentes e ensaio final. Não há novo prazo prometido sem dimensionamento comprovado. Aceite humano, documentos reais e revisão independente não podem ser fabricados por testes sintéticos.

## Documentos de apoio

- [Matriz histórica prometido × entregue](PROMETIDO-ENTREGUE-2026-09-13.md)
- [Segurança S1/S4](SEGURANCA-S1-S4.md), [S2/S3/S10](SEGURANCA-S2-S3-S10.md), [S5/S9](SEGURANCA-S5-S9.md)
- [Critérios completos](ESCOPO-COMPLETO-ESTRUTURADO.md) e [roadmap](README.md)

## Atualização após autorização de homologação

O usuário autorizou explicitamente publicar a versão integrada para testar. Em 14/09/2026, às 01:37:56 UTC, foi preparada e instalada a candidata **1.14.0-rc.20260914t013756z**, em https://homolog.oreembolsobot.app. SHA-256 do backend: `200c49fa6e2ea76b0185d132530cf7babd0dbcf35b6e1c2cf8ca546731be5cc6`. O endpoint público `release.json` confirmou o mesmo hash.

- **745 testes passaram, 20 ignorados; 23 SQL passaram separadamente.** Tipos, lint e build passaram. Navegador: oito verificações, nove capturas e zero erros; massa sintética removida. Contagens não devem ser somadas.
- E5 evoluiu para implementação parcial em homologação: importação CSV, prévia sem escrita, erros por linha, vínculo CLT/MEI/PJ, superior restrito à empresa, confirmação assinada e convites opcionais após confirmação. A integração da hierarquia com revisão e o envio real ainda precisam de aceite.
- Backup do banco e da aplicação anterior feitos antes das migrações 0013–0020 aplicáveis. Reversão automática da aplicação preparada; migrações são aditivas. O processo de produção manteve o PID.
- Isolamento aplicado: usuário Linux exclusivo e conta de banco com permissões somente na homologação; listener 127.0.0.1:3101 e negação de acesso ao banco de produção verificados pelo script operacional.
- Revisão independente por outro **agente IA**, com 75 testes focais aprovados; não representa revisão humana ou CI remoto. A publicação é candidata local autorizada para teste, com alterações sem commit identificadas no manifesto. Não autoriza promoção a produção.
- 360dialog retornou HTTP 401 para a chave instalada. No GitHub existem `API_KEY`, `API_GOOGLE_MAPS`, `API_NFE_IO` e `OPEN_AI_KEY`; falta aplicar as configurações atuais por fluxo seguro. O worker não foi habilitado pelo deploy.

Os dados anteriores ficam como histórico da rodada, não como estado atual. O aceite integral permanece **0/12** até a comprovação dos critérios externos e comuns.

[Roteiro de teste](ROTEIRO-HOMOLOG-2026-09-14.md) · [Revisão do candidato](REVISAO-CANDIDATO-2026-09-14.md)

## Provisionamento concluído

O [PR #43](https://github.com/comeca-ai/projeto_tribureembolsa/pull/43) passou no CI e foi integrado. A [execução de provisionamento](https://github.com/comeca-ai/projeto_tribureembolsa/actions/runs/34797596830) concluiu com sucesso: chaves atuais de 360dialog, Maps e NFE.io aplicadas por SSH restrito, segredo do receptor gerado localmente, health e autenticação do webhook conferidos sem enviar mensagem. O worker permaneceu desativado. A consulta real da nova chave da 360dialog está em conferência separada.

O login real na homologação também passou em 13 verificações, com logout e bloqueio da sessão revogada; massa sintética removida. O resultado de código publicado, configuração aplicada e aceite de negócio continua separado.

## Diagnóstico final do canal

A nova chave foi validada em duas consultas: `/health_status` e `/v1/configs/webhook` responderam **HTTP 200**. O destino atual é exatamente `https://oreembolsobot.app/api/webhooks/360dialog`, e o cabeçalho do provedor difere do segredo do receptor em homologação. O webhook do provedor não foi alterado.

Para completar o ensaio pelo WhatsApp, está pendente confirmar que o canal é exclusivo de teste e autorizar seu redirecionamento, além de identificar número/empresa para a lista restrita. A pergunta foi enviada ao usuário; nenhuma resposta foi presumida. Restam **11 de 20 chamadas** no controle global após as consultas 8 e 9.

Relatórios: **84 arquivos verificados por HTTPS com hashes correspondentes**, sete abas do painel e zero erros de navegador nesta rodada. O acervo K2 adicional teve seis arquivos conferidos com HTTP 200 e hashes corretos.

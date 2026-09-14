# Status da POC e prestação de contas — 14/09/2026

## Atualização de encerramento da rodada técnica — 19:50 UTC

A candidata `1.14.0-rc.20260914t194124z` foi publicada somente em homologação após `check`, `lint`, `build` e a suíte integrada (**826 testes aprovados, 39 ignorados; 28 SQL aprovados**). O bundle `cf29de3964a957f5cae4f1fe0b3ce9bb3cc14e209e04469168a4fec3fbeeaae9` foi conferido no manifesto HTTPS. O fluxo de check-in/check-out independente de veículo e política está no bundle publicado; produção permaneceu inalterada.

O commit local `ae2cf74`, na branch `feat/poc-integrada-20260914`, reúne 199 arquivos revisados. O push para o GitHub e a abertura da PR ficaram bloqueados por `Permission denied (publickey)` no remoto SSH. A POC continua sem aceite integral E1–E12 e sem promoção para produção.

Atualizado em **2026-09-14T14:10:19.800441+00:00**. Responsável: **Codex — agente executor de IA**.

**Os ajustes estão publicados em homologação para teste. A POC completa ainda não foi aceita. Os prazos informados não foram cumpridos.**

[Abrir homologação](https://homolog.oreembolsobot.app/login) · [Painel visual de status](https://oreembolsobot.app/relatorios/poc-entrega-20260913-ff495cce4ade/) · [Revisão dos ajustes](REVISAO-AJUSTES-2026-09-14.md)

## Publicado nesta atualização

| Item | Situação e limite |
| --- | --- |
| Confirmação de comprovante | Somente **Comprovante Recebido!**. Fila persistente separada do OCR; varredura a cada segundo. Não inicia envio após 24 horas da mensagem recebida. |
| Canal WhatsApp | Webhook corrigido e número do piloto autorizado. Foto recebida, despesa criada e resposta com entrega/leitura registradas. A fila automática já enviou a confirmação de uma reentrega posterior. |
| Colaborador / CC | Corrigida a gravação para vínculo ativo único do usuário. A lista identifica campos ausentes; a revisão permite escolher o colaborador com justificativa e histórico. Despesas legadas sem vínculo comprovado exigem essa seleção. |
| Verificação fiscal | Opção por empresa em **Empresas → Verificação fiscal**, desativada inicialmente. Consulta após OCR e antes da decisão no painel e no WhatsApp. Credencial existente e teto separado de 20 consultas configurados. |
| Cobertura NFE.io | Adaptador atual atende NF-e **modelo 55**. O cupom real usado nos testes é NFC-e **modelo 65**: autenticidade não confirmada; não houve consulta paga para esse documento. |
| Check-in/check-out | Gravação de pontos/IDs, concorrência e replay aprovados em banco de testes. Na empresa do piloto, conferida às 14:16 UTC: nenhum veículo, nenhuma configuração de campo e nenhuma jornada registrada. Teste real ainda não está pronto. |
| Google Maps | Em **Campo → Parâmetros da política de campo**, cálculo automático após check-out é opcional e intervalo entre tentativas é editável. Padrão de 30 minutos; resultado calculado é reutilizado. Consulta real de uma jornada ainda não comprovada. |

A leitura visual encontrou o mesmo cupom em três entradas de teste e divergência na classificação automática. Elas permanecem em revisão e precisam de conciliação; não foram autenticadas fiscalmente nem pagas.

## Evidência da publicação

- Candidato: **1.14.0-rc.20260914t135904z**; base Git `1eab6fee72cbe65985383a3b917e1bed321610a2`, incluindo mudanças locais declaradas.
- SHA-256 do backend: `c8f25c1a09d6dd1c8ae66c59f7edc86bb076676fdd05111553ef4db230581bbd`; versão HTTPS conferida com o arquivo instalado.
- **782 testes gerais aprovados, 34 não executados na suíte geral; 25 testes SQL de fluxo/Maps e 12 fiscais aprovados**. Há sobreposição entre as contagens gerais e SQL; não são somadas como testes distintos.
- Typecheck, lint e build concluídos. Revisão cruzada por agentes; CI remoto do conjunto e aceite humano não comprovados.
- Backup de banco/configuração e versão anterior preservados. O PID da produção permaneceu igual; somente homologação foi publicada.
- Navegador HTTPS às14:11 UTC: **5 verificações aprovadas** — coluna sem campos vazios, correção de colaborador/CC com persistência e auditoria, opção fiscal ativada/desativada, parâmetro Maps visível e ausência de erro JavaScript. Conta e empresa sintéticas removidas ao final. As duas primeiras tentativas falharam por seletores/espera do teste; a execução final validou as interações publicadas.

## Saldo e pendências do teste

Na leitura das **14:05 UTC**, foram reservadas **19 de 20 chamadas compartilhadas de WhatsApp/OpenAI**. A ampliação para mais 20 foi solicitada e ainda não autorizada. O saldo é persistente e não se renova ao reiniciar o serviço. Novas fotos que exigem mais chamadas que o saldo disponível permanecem guardadas na fila.

A confirmação curta foi entregue e lida no teste; confirmação de recebimento não significa conclusão de OCR, aprovação fiscal ou pagamento. A foto original de aproximadamente 09:15 de Brasília também apareceu na fila por reentrega do provedor.

**Aceite integral comprovado: 0/12.** Permanecem, entre outros, o ensaio real dos três modos, reversão, conciliação de duplicidades, validação fiscal de documento suportado, jornada real com Maps, completude das métricas e aceite E1–E12. O painel mantém cada lacuna e responsável explícitos.

## Promessas recuperadas e resultado

| Compromisso registrado | Prestação de contas |
| --- | --- |
| Integrar e entregar o escopo completo até as 18h de 13/09 | **Não cumprido.** O fuso original não foi confirmado; o registro anterior adotou UTC como referência conservadora. |
| “Vou continuar até fechar as lacunas e validar a POC”, em 14/09 às 01:15 UTC | **Ainda devido.** A execução chegou à homologação parcial; continuaram faltando funcionalidades e o ensaio completo. Encerrar a rodada não cumpriu esse compromisso. |
| Subir a versão integrada em homologação, anunciado às 01:25 UTC | Candidato instalado às 01:37 e conferido novamente agora. Foi uma liberação autorizada para teste, com mudanças locais identificadas e revisão por IA. |
| Conectar as chaves e liberar o teste do canal, reiterado às 01:43 UTC | Destino e autenticação corrigidos com autorização. Uma foto foi processada em homologação e a confirmação curta já teve entrega e leitura registradas. |
| Avisar quando o usuário pudesse testar com seu número | Canal habilitado para o número do piloto. Recebimento e resposta confirmados; processamento de novas fotos depende de saldo autorizado suficiente. |
| Relatórios públicos e atualização a cada meia hora | Publicação documental e timer existentes. Este relatório substitui as conclusões operacionais antigas nos pontos atualizados. |
| Auditoria a cada duas horas e revisão automática | **Sem comprovação de entrega.** O timer do painel apenas copia documentos. |
| Produção somente estável, revisada e testada | A candidata continua restrita à homologação. O CI do provisionamento não é o CI de todo o aplicativo integrado. |
| 360dialog exclusivo; banco privado preparado para S3/R2 | Canal padrão e armazenamento documentados; fluxo externo completo e migração de armazenamento não comprovados. |

Assumo a falha de continuidade, o prazo não cumprido e a comunicação que não deixou suficientemente clara a distância entre implementação parcial e entrega integral. Não atribuo a pendências de configuração todas as lacunas: há trabalho de código ainda devido. Nenhum novo horário de conclusão foi prometido nesta revisão.


## Referências

- [Contratos fiscais, cobertura e rollback](VERIFICACAO-FISCAL-OPCIONAL.md).
- [Roteiro de homologação](ROTEIRO-HOMOLOG-2026-09-14.md).
- [Prometido e entregue em 13/09](PROMETIDO-ENTREGUE-2026-09-13.md).
- [Manifesto servido da homologação](https://homolog.oreembolsobot.app/release.json).

**Assinado: Codex — agente executor de IA.** Assinatura textual de responsabilidade; não constitui aceite humano.

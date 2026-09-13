# POC-08 — Concluir conversa, pendências de evidência e retorno da decisão

**Marco:** POC 2 — Canal único 360dialog\
**Prioridade:** P0\
**Responsabilidade:** Reembolso e WhatsApp; responsável nominal a definir\
**Referências:** WP-05, WP-06, WP-07, E10\
**Depende de:** POC-03, POC-04, POC-06, POC-07, POC-17

## Resultado esperado

O colaborador envia o comprovante, acompanha pendências e recebe a decisão autorizada com regra citada.

## Ponto de partida verificado

Máquina antiga cobre onboarding; o ciclo produtivo de comprovante, decisão e comunicação pela 360dialog ainda precisa de integração.

## Critérios de aceite

- [ ] Persistir estado da conversa e correlação com a evidência; cobrir mensagens fora de ordem, fora de contexto, expiração e reinício.
- [ ] Usar o mesmo decisor determinístico da web; regra, versão e autoria acompanham o resultado.
- [ ] Revisão humana grava decisão e intenção de notificação atomicamente; callback interno, se usado, é autenticado, idempotente e auditável.
- [ ] Respeitar o modo da empresa: comunicação de decisão automática não ocorre em sombra; confirmação humana governa assistido.
- [ ] Comprovar recebimento → revisão → retorno no canal oficial, com fallback operacional visível em falhas.
- [ ] Backoffice apresenta o mesmo caso do WhatsApp com documento, regra, pendência, responsável vigente e decisão; integrar o detalhe da jornada/cálculo quando POC-10 estiver disponível. Colaborador conclui o caso sem abrir outra interface.
- [ ] Solicitação de nova evidência não altera fatos extraídos; não introduzir preenchimento manual de valores fiscais pela conversa.
- [ ] Separar decisão de reembolso de confirmação de crédito fiscal; auditar a atualização acoplada hoje existente em revisao.decidir antes de automatizar.

## Decisões a fechar durante esta entrega

- Fechar quais perguntas de cadastro/contexto/evidência são permitidas: D-014 veda completar dados da nota, enquanto o texto antigo de WP-05 menciona campos pendentes. Registrar contrato antes de implementar perguntas.

## Evidência de conclusão

Vincular PRs, testes relevantes e teste manual em homologação. Alteração de dados,
autorização ou integração exige prova em banco/API e plano de reversão. Código
mesclado, homologação e habilitação produtiva são estados distintos.

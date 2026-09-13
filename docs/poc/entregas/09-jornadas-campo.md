# POC-09 — Registrar check-in, checkpoints e check-out com jornada persistente

**Marco:** POC 3 — Jornada de campo e Google Maps  
**Prioridade:** P0  
**Responsabilidade:** Campo e dados; responsável nominal a definir  
**Referências:** E11, escopo atualizado de campo  
**Depende de:** POC-02, POC-04, POC-06

## Resultado esperado

Guardar saída, cada visita e retorno para consolidar o período posteriormente.

## Ponto de partida verificado

checkins_campo guarda posição, pessoa, empresa, tempo, precisão e origem. Não existe jornada, diferenciação de eventos nem gravação pelo canal.

## Critérios de aceite

- [ ] Criar contrato de jornada e eventos check_in/checkpoint/check_out, com ID externo único, contexto autorizado e correlação com mensagens.
- [ ] Guardar coordenadas e timestamp informado pelo provedor separados de recebidoEm; horário de captura GPS e precisão são opcionais, apenas quando disponíveis.
- [ ] Definir associação entre comando e localização; não adivinhar o tipo de evento de uma coordenada sem contexto.
- [ ] Tratar duplicação, eventos atrasados/fora de ordem, checkout sem entrada, jornada atravessando meia-noite/fuso e falta de fechamento.
- [ ] Preservar eventos originais e corrigir por registros auditados; não chamar Maps nem gerar pagamento durante a captura.
- [ ] Registrar ciência e regras de acesso/retenção aprovadas para localização; coletar pontos enviados conscientemente, sem presumir rastreamento contínuo.
- [ ] Apresentar confirmação e pendências conhecidas; não afirmar detectar toda visita omitida sem referência externa.

## Evidência de conclusão

Vincular PRs, testes relevantes e teste manual em homologação. Quando houver
mudança de dados, autorização ou integração externa, anexar prova em banco/API
e plano de reversão. Código mesclado, homologação e habilitação produtiva são
estados distintos. Não fechar a issue apenas porque o PR foi aberto.


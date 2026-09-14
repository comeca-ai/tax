# POC-14 — Cobrar notas pendentes pelo WhatsApp e encerrar lembretes ao regularizar

**Marco:** POC 4 — Combustível e documentação fiscal\
**Prioridade:** P0\
**Responsabilidade:** WhatsApp e operação; responsável nominal a definir\
**Referências:** E10, decisão de cobrança de combustível\
**Depende de:** POC-06, POC-08, POC-13

## Resultado esperado

O vendedor de campo recebe uma solicitação objetiva das notas faltantes, com o CNPJ do empregador, e a pendência acompanha o envio.

## Ponto de partida verificado

Não há régua de cobrança ligada ao consolidado de campo/combustível.

## Critérios de aceite

- [ ] Gerar cobrança a partir de pendência real do período, e não a cada checkout nem por igualdade rígida de litros.
- [ ] Mensagem identifica período, documentação pedida e CNPJ do empregador autorizado; informa como enviar a nota pela conversa.
- [ ] Periodicidade, prazo, limite de lembretes e escalonamento para gestor são configurados por empresa e auditados.
- [ ] Respeitar janela/templates homologados; outbox, chave por pendência/etapa e verificação antes do envio impedem cobranças repetidas ou já resolvidas.
- [ ] Recebimento atualiza pendência para em_validacao; validação/conciliação regulariza e interrompe lembretes; rejeição motivada permite orientação correta.
- [ ] Falha do provedor e suspensão/desligamento têm tratamento explícito; não enviar cobrança para número sem vínculo atual.
- [ ] Falta de nota mantém documentação pendente; bloquear reembolso apenas se houver regra empresarial explicitamente validada, versionada e comunicada.

## Evidência de conclusão

Vincular PRs, testes relevantes e teste manual em homologação. Quando houver
mudança de dados, autorização ou integração externa, anexar prova em banco/API
e plano de reversão. Código mesclado, homologação e habilitação produtiva são
estados distintos. Não fechar a issue apenas porque o PR foi aberto.

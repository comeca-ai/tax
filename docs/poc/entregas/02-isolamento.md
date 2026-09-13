# POC-02 — Provar identidade, isolamento e reentrega segura na API e no banco

**Marco:** POC 1 — Base segura e cadastros\
**Prioridade:** P0\
**Responsabilidade:** Backend e dados; responsável nominal a definir\
**Referências:** E2, WP-01, WP-02, WP-03\
**Depende de:** POC-01

## Resultado esperado

Toda operação e toda reentrega continuam vinculadas ao colaborador e à empresa autorizados.

## Ponto de partida verificado

Identificação por telefone e fila de revisão por empresa estão integradas. Há guardas e FKs compostas, mas a presença de testes estáticos não comprova os cenários no banco.

## Critérios de aceite

- [ ] Testar na API e em MySQL/MariaDB real número desconhecido, suspenso, sem vínculo e vínculo ambíguo; nenhum pode criar despesa/jornada indevida.
- [ ] Derivar contexto empresarial do vínculo autenticado no canal; na API interna, validar o contexto antes de leituras e efeitos, inclusive nas respostas idempotentes.
- [ ] Reentregar o mesmo messageId com outro contexto não revela IDs, arquivos ou resultados da empresa original.
- [ ] Provar que analista/aprovador e administrador permitido acessam somente a fila autorizada; delegação exige motivo e trilha.
- [ ] Testar restrições compostas, concorrência, reserva falha, recuperação após reinício e ausência de duplicação de efeitos.

## Evidência de conclusão

Vincular PRs, testes relevantes e teste manual em homologação. Quando houver
mudança de dados, autorização ou integração externa, anexar prova em banco/API
e plano de reversão. Código mesclado, homologação e habilitação produtiva são
estados distintos. Não fechar a issue apenas porque o PR foi aberto.

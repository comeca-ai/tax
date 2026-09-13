# POC-06 — Conectar 360dialog à inbox/outbox e desativar caminhos legados

**Marco:** POC 2 — Canal único 360dialog\
**Prioridade:** P0\
**Responsabilidade:** Integração WhatsApp; responsável nominal a definir\
**Referências:** E10, WP-01, WP-02, D-022\
**Depende de:** POC-02

## Resultado esperado

Um único transporte recebe mensagens e mídia, persiste o trabalho e envia respostas recuperáveis.

## Ponto de partida verificado

Existe ingestão 360dialog isolada e tabelas de fila. O seletor ainda usa Evolution como padrão; o webhook atual responde antes da persistência terminar.

## Critérios de aceite

- [ ] Usar exclusivamente 360dialog para entrada/saída da POC; preservar interface entre canal e negócio.
- [ ] Confirmar recebimento válido somente depois de persistência durável; falha de gravação não pode virar sucesso com evento perdido.
- [ ] Worker processa inbox/outbox com concorrência controlada, retentativas limitadas, recuperação de trabalhos interrompidos e falha definitiva observável.
- [ ] Normalizar texto, mídia, localização e status; baixar mídia com credencial de servidor e validar limites antes de consumo excessivo de memória.
- [ ] Ausência de credencial/configuração mantém o canal fechado; remover padrão Evolution e impedir processamento paralelo dos webhooks legados no ambiente da POC.
- [ ] Registrar ID de mensagem/entrega e tratar retorno incerto do provedor sem prometer exactly-once externo; testar reentrega sem duplicar efeitos locais.
- [ ] Homologar número, webhook e templates necessários; segredos permanecem no ambiente.

## Evidência de conclusão

Vincular PRs, testes relevantes e teste manual em homologação. Quando houver
mudança de dados, autorização ou integração externa, anexar prova em banco/API
e plano de reversão. Código mesclado, homologação e habilitação produtiva são
estados distintos. Não fechar a issue apenas porque o PR foi aberto.

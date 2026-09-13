# POC-10 — Consolidar jornadas posteriormente com Google Maps

**Marco:** POC 3 — Jornada de campo e Google Maps\
**Prioridade:** P0\
**Responsabilidade:** Campo e integrações; responsável nominal a definir\
**Referências:** E11\
**Depende de:** POC-03, POC-05, POC-09

## Resultado esperado

Um worker estima os trechos percorridos entre pontos ordenados e produz um consolidado auditável por período.

## Ponto de partida verificado

Não foi localizada integração de rotas. A tabela de posições e cálculos isolados não fornecem quilometragem de jornada.

## Critérios de aceite

- [ ] Definir serviço de rotas Google, orçamento, limites e credencial; verificar condições atuais de armazenamento/exibição antes de persistir respostas do provedor.
- [ ] Calcular trechos na ordem dos eventos sem otimizar/reordenar visitas; segmentar quando necessário e conservar a relação com os pontos originais.
- [ ] Job posterior ao fechamento usa chave de cálculo/versionamento para evitar cobranças e somas duplicadas; falha fica aguardando_calculo.
- [ ] Registrar método, pontos usados, versão, instante, status e somente os resultados permitidos; recalcular cria nova versão sem substituir eventos originais.
- [ ] Separar km comerciais e não comerciais pela política; valor de reembolso usa a tarifa vigente e arredondamento aprovado.
- [ ] Exibir distância como estimativa entre pontos, não como prova de caminho efetivamente percorrido; gaps conhecidos ficam pendentes de conferência.
- [ ] Não inventar trechos faltantes nem liberar valor automaticamente quando a evidência é insuficiente.

## Evidência de conclusão

Vincular PRs, testes relevantes e teste manual em homologação. Quando houver
mudança de dados, autorização ou integração externa, anexar prova em banco/API
e plano de reversão. Código mesclado, homologação e habilitação produtiva são
estados distintos. Não fechar a issue apenas porque o PR foi aberto.

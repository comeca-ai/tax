# POC-16 — Executar aceite ponta a ponta e preparar release da POC completa

**Marco:** POC 5 — Métricas, homologação e release  
**Prioridade:** P0  
**Responsabilidade:** Produto, revisão e operação; responsável nominal a definir  
**Referências:** E12, WP-07  
**Depende de:** POC-01, POC-02, POC-03, POC-04, POC-05, POC-06, POC-07, POC-08, POC-09, POC-10, POC-11, POC-12, POC-13, POC-14, POC-15, POC-17

## Resultado esperado

Demonstrar com evidências o fluxo completo e registrar aprovação técnica e de produto antes da release.

## Ponto de partida verificado

A conclusão das branches WP não equivale ao aceite da POC ampliada de campo e combustível.

## Critérios de aceite

- [ ] Executar empresa/política → equipe/veículo → 360dialog → comprovante → decisão/revisão/retorno e recibos de pedágio/estacionamento.
- [ ] Executar saída → visitas → retorno → cálculo posterior Maps → km comerciais → conciliação → cobrança de nota no CNPJ → validação → regularização.
- [ ] Cobrir nota ausente/divergente, mesmo documento em outra mensagem, eventos duplicados/atrasados, reinício de worker, falhas Maps/360dialog e tentativa entre empresas; incluir falha de consulta fiscal se ela permanecer no escopo decidido em POC-12.
- [ ] Demonstrar veredito idêntico nos três modos em ambiente controlado; promover sombra→assistido e reverter. Uso autônomo real requer aceite próprio.
- [ ] Apresentar métricas, amostra auditada, limitações conhecidas e nenhum defeito bloqueante aberto.
- [ ] Registrar revisão adicional e aceite de produto, sem transformar ressalvas de escopo em entregas concluídas.
- [ ] Preparar changelog, tag/artefato aprovado, backup, procedimento real de deploy, health check e rollback; ativação produtiva só após autorização prevista na política de release.
- [ ] Demonstrar trajeto elegível aprovado automaticamente a partir de cargos/responsabilidades/regras extraídos e validados da política; caso ambíguo vai à revisão, mantendo trilha.
- [ ] Executar o mesmo caso nas jornadas B2B/B2C: colaborador conclui somente pelo WhatsApp, empresa acompanha detalhe e exceções no backoffice; trilha correlaciona mensagem, tenant, pessoa, pontos, documento, política, cálculo e decisão.
- [ ] Demonstrar campos e confiança do OCR e sinais de manipulação com documentos controlados; mídia suspeita vai à revisão sem acusação automática de fraude.
- [ ] Operador autorizado localiza e reprocessa falha pela correlação sem duplicar efeitos ou expor outra empresa; nenhum segredo aparece em logs, telas ou exportações.
- [ ] Equipe interna repete o roteiro sem dependência obrigatória da K2 e recebe runbook e pacote mínimo de evidências de teste; isto não exige construir um produto de dossiê fiscal completo.
- [ ] Registrar decisão sobre SEFAZ/E8 e os demais limites em [GAPS-JORNADAS](../GAPS-JORNADAS.md); não confundir aceite de homologação com autorização de produção ou SLA.

## Evidência de conclusão

Vincular PRs, testes relevantes e teste manual em homologação. Alteração de dados,
autorização ou integração exige prova em banco/API e plano de reversão. Código
mesclado, homologação e habilitação produtiva são estados distintos.

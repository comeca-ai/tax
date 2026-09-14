# POC-13 — Conciliar jornada, quilômetros, veículo e notas por período

**Marco:** POC 4 — Combustível e documentação fiscal\
**Prioridade:** P0\
**Responsabilidade:** Campo e combustível; responsável nominal a definir\
**Referências:** E4, E11, decisão de conciliação\
**Depende de:** POC-03, POC-05, POC-10, POC-11, POC-12

## Resultado esperado

Reunir check-ins/checkpoints/check-out consolidados e abastecimentos para apontar documentação faltante ou divergente.

## Ponto de partida verificado

A conciliação integrada ainda não existe. Há dados e motores isolados a conectar.

## Critérios de aceite

- [ ] Consolidar por empresa, colaborador, veículo e período, com links para jornadas e documentos de origem.
- [ ] Somar distâncias comerciais uma vez e calcular consumo esperado somente quando o km/L usado está disponível e versionado.
- [ ] Permitir um abastecimento cobrir várias jornadas; alocar litros/documentos sem dupla contagem entre períodos.
- [ ] Considerar estoque de tanque desconhecido, abastecimentos fora da janela, uso não comercial e troca de veículo como limitações explícitas; litros comprados não equivalem automaticamente a litros consumidos.
- [ ] Produzir estados conciliado, documentacao_pendente, divergencia e revisao com motivo e histórico, sem acusação automática de fraude.
- [ ] Reembolso por km mantém sua decisão e política; situação documental/fiscal tem estado separado e não garante crédito tributário.
- [ ] Reprocessamento e nota tardia geram nova versão do consolidado; testar duplicação, ausência de checkout e período incompleto.

## Evidência de conclusão

Vincular PRs, testes relevantes e teste manual em homologação. Quando houver
mudança de dados, autorização ou integração externa, anexar prova em banco/API
e plano de reversão. Código mesclado, homologação e habilitação produtiva são
estados distintos. Não fechar a issue apenas porque o PR foi aberto.

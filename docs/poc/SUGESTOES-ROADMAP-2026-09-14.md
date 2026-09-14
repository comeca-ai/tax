# Sugestões de roadmap — 14/09/2026

## Entrega desta noite: checkpoints

- Reutilizar o agregado `poc_campo`; não criar tabela analítica nova nesta noite.
- Aplicar índice por `empresa_id` para a leitura tenant-scoped.
- Expor `campo.checkpoints({ empresaId })`, validando acesso à empresa e listando colaboradores ativos, inclusive os sem registros.
- Mostrar os acumulados no dashboard inicial e no menu suspenso imediatamente abaixo de **Envio rápido**.
- Fechar com testes de domínio, endpoint por empresa e validação publicada em homologação.

## Próxima ordem sugerida

1. **E11 — jornada real:** ensaio com empresa real, quilometragem e reversão documentadas.
2. **E10 — WhatsApp:** entrega real no provedor, webhook, idempotência e evidência de ponta a ponta.
3. **E8 — fiscal:** consulta NF-e modelo 55 com orçamento explícito, persistência e replay.
4. **E1–E3 — modos e política:** fechar revisão, escopo dos cargos/funções e comportamento assistido/autônomo.
5. **E6 — métricas:** definir indicadores e fonte de cada número antes de publicar novos painéis.
6. **E12 — aceite integral:** repetir os doze cenários em ambiente homologado e registrar evidências.

## Dependências e critério de pronto

Cada item deve sair por PR, CI verde, deploy de homologação, teste HTTPS e evidência anexada ao relatório de aceite. A tabela analítica histórica de checkpoints fica para uma etapa posterior, somente se o volume e a retenção justificarem separar o agregado operacional.


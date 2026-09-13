# POC-05 — Unificar veículo e consumo declarado do colaborador

**Marco:** POC 1 — Base segura e cadastros  
**Prioridade:** P0  
**Responsabilidade:** Backend e interface; responsável nominal a definir  
**Referências:** E4  
**Depende de:** POC-02

## Resultado esperado

Cada jornada e abastecimento pode referenciar o veículo correto e a versão do consumo usada no cálculo.

## Ponto de partida verificado

Placa, RENAVAM, motorização, UF e consumo estão distribuídos entre tabelas. O cálculo existente não comprova vínculo no fluxo real.

## Critérios de aceite

- [ ] Disponibilizar cadastro único com placa, RENAVAM, motorização, UF de licenciamento e km/L declarado, vinculado à pessoa/empresa.
- [ ] Impedir duplicação da mesma placa para a mesma pessoa e associações entre empresas.
- [ ] Suportar escolha do veículo na jornada e alteração auditada; histórico não muda quando o cadastro é atualizado.
- [ ] Consumo ausente/inválido gera pendência visível; não estimar litros com um valor inventado.
- [ ] Testar o indicador de divergência de consumo já previsto no motor e confirmar sua aplicação no fluxo integrado.

## Evidência de conclusão

Vincular PRs, testes relevantes e teste manual em homologação. Quando houver
mudança de dados, autorização ou integração externa, anexar prova em banco/API
e plano de reversão. Código mesclado, homologação e habilitação produtiva são
estados distintos. Não fechar a issue apenas porque o PR foi aberto.


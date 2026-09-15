# POC-15 — Medir o piloto e registrar pagamento com autoria

**Marco:** POC 5 — Métricas, homologação e release\
**Prioridade:** P0\
**Responsabilidade:** Produto e relatórios; responsável nominal a definir\
**Referências:** E6\
**Depende de:** POC-03, POC-08

## Resultado esperado

Avaliar adoção, qualidade, tempo operacional e documentação usando dados rastreáveis por empresa/período.

## Ponto de partida verificado

Relatórios atuais não medem toda a régua da POC; não está comprovado estado paga com ato/autoria no fluxo.

## Critérios de aceite

- [ ] Definir a régua e instrumentar eventos desde as primeiras entregas: convidados/ativados/usuários ativos, tempo envio–decisão–pagamento, revisão, confiança e precisão por amostra.
- [ ] Adicionar indicadores de jornada incompleta, km estimados, cobertura de notas, divergências e cobranças resolvidas conforme POC-09 a POC-14 integrarem.
- [ ] Registrar pagamento como ato autorizado com data/responsável; aprovada nunca vira paga sozinha, sem integração PIX nesta entrega.
- [ ] Auditoria amostral mede acertos/falsos positivos sem mudar status ou valor da despesa.
- [ ] Medir OCR por campo e detecção de manipulação no conjunto de teste acordado em POC-07/12, incluindo falsos negativos e limites da amostra; metas são pactuadas antes do aceite, sem confundir confiança declarada com precisão medida.
- [ ] Relatórios filtram empresa/período e explicitam denominadores e casos sem dados; metas numéricas ficam acordadas com a empresa piloto.
- [ ] Confrontar no aceite as cinco dimensões da régua original; resolver sua enumeração se a documentação estiver incompleta.

## Evidência de conclusão

Vincular PRs, testes relevantes e teste manual em homologação. Quando houver
mudança de dados, autorização ou integração externa, anexar prova em banco/API
e plano de reversão. Código mesclado, homologação e habilitação produtiva são
estados distintos. Não fechar a issue apenas porque o PR foi aberto.

## Implementação disponível para validação

- `metricasPoc.resumo({ empresaId, inicio, fim })`: acesso administrativo à empresa;
  datas ISO com fuso; coorte de despesas **criadas** no intervalo UTC `[inicio,fim)`.
  Pagamentos e decisões posteriores à criação são considerados até a consulta.
  Retorna denominador de despesas, revisão, pagamentos manuais, confiança declarada,
  médias em milissegundos criação–decisão, criação–pagamento e decisão–pagamento.
  Cada média informa denominador e quantidade sem dados ou com cronologia inválida.
  Criação não é envio: a API explicita essa limitação e não inventa tempo de envio.
- `metricasPoc.auditarAmostra({ empresaId, despesaId, conjunto, campo, previsto,
  observado, evidencia })`: administrador registra avaliação binária com referência
  ao conjunto de teste e à evidência examinada. Por exemplo, para manipulação,
  `previsto` é a detecção avaliada e `observado` é o resultado da conferência humana.
  Para OCR, o auditor precisa definir previamente a proposição binária por campo;
  este contrato não calcula erro textual nem valida o protocolo do conjunto.
  O ato insere `poc.auditoria_amostral` na trilha existente com usuário/data,
  sem atualizar status ou valores. Reavaliações preservam todas as entradas;
  a última por despesa/conjunto/campo compõe a matriz, sem inflar a amostra.
- Matrizes separadas por conjunto/campo mostram VP, VN, FP, FN, denominador,
  acurácia e precisão (`null` quando não há positivos previstos). Não extrapolam
  para a população nem confundem confiança declarada com precisão.
- `campo.registrarPagamento` já exige despesa aprovada, administrador, data não futura,
  referência e autoria, com unicidade/idempotência e auditoria transacional.
  Registro de pagamento é separado do status de aprovação; não dispara PIX.

Aplicar `db/migrations/0023_metricas_poc_indices.sql` antes de habilitar o painel;
a migração cria somente os índices compostos usados pelas consultas de despesas
e auditoria e aceita reexecução pelo aplicador idempotente. Reversão funcional:
retirar os dois endpoints e sua entrada no router, conservando os índices e os
registros de auditoria já inseridos. Ainda faltam ensaio em
banco/API de homologação, eventos de envio/adoção e conjunto/metas acordados com o
piloto. Estas mudanças não encerram E6 nem comprovam aceite integral.

### Caminho na interface

Em **Relatórios**, selecione empresa e período. O painel **Métricas do piloto e
registros** usa dias UTC completos, preservando o fim exclusivo da API. Exibe
carregamento, falha com repetição, ausência de dados e denominadores. Os formulários
registram avaliação binária com evidência e pagamento manual com referência/data
no horário local do navegador, convertida para UTC antes do envio. O responsável
é o usuário autenticado; a autoridade é revalidada no banco
sob bloqueio antes da escrita. Trocar empresa/período reinicia os formulários.

Verificação local: 18 testes unitários focais; 3 testes SQL/API em banco descartável
e 5 cenários de navegador com API interceptada e dados sintéticos. A suíte
`db/metricas.integracao.test.ts` só aceita `POC_TEST_DATABASE_URL` local com nome
`reembolsa_poc_test_*`, sem DDL e com limpeza dos IDs criados. O navegador
`tools/poc/metricas-browser.mjs` não inicia API nem acessa banco/provedores; grava
o resultado fora do git. Esses ensaios não equivalem a homologação ou aceite.

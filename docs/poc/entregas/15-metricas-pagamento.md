# POC-15 — Medir o piloto e registrar pagamento com autoria

**Marco:** POC 5 — Métricas, homologação e release  
**Prioridade:** P0  
**Responsabilidade:** Produto e relatórios; responsável nominal a definir  
**Referências:** E6  
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

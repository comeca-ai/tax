# POC-11 — Receber notas de combustível no CNPJ do empregador

**Marco:** POC 4 — Combustível e documentação fiscal\
**Prioridade:** P0\
**Responsabilidade:** Fiscal e documentos; responsável nominal a definir\
**Referências:** E7, motor fiscal combustível\
**Depende de:** POC-02, POC-05, POC-07

## Resultado esperado

Cada abastecimento documentado pertence ao empregador, veículo/pessoa e período corretos, disponível para validação e conciliação.

## Ponto de partida verificado

OCR e motor fiscal existem; falta completar chave fiscal e fluxo de nota de combustível independente do reembolso por km.

## Critérios de aceite

- [ ] Receber XML/foto/PDF e extrair chave de acesso, CNPJ destinatário/emitente, data, itens de combustível, litros e valores.
- [ ] Validar a chave de 44 dígitos e o documento; chave ausente/malformada gera pendência, sem perder o envio.
- [ ] Conferir CNPJ destinatário contra o empregador autorizado; documento sem destinatário ou divergente não é classificado como regular.
- [ ] Guardar documento original/hash e proveniência da extração com acesso restrito; associação ao veículo/abastecimento é explícita.
- [ ] Separar combustível para análise fiscal de reembolso por quilometragem e de recibos de pedágio/estacionamento.
- [ ] Documento no CNPJ não implica crédito aproveitável: apuração permanece no motor fiscal com regras próprias e revisão responsável.

## Evidência de conclusão

Vincular PRs, testes relevantes e teste manual em homologação. Quando houver
mudança de dados, autorização ou integração externa, anexar prova em banco/API
e plano de reversão. Código mesclado, homologação e habilitação produtiva são
estados distintos. Não fechar a issue apenas porque o PR foi aberto.

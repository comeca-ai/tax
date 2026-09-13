# POC-07 — Homologar comprovantes integrados e conectar OCR existente

**Marco:** POC 2 — Canal único 360dialog  
**Prioridade:** P0  
**Responsabilidade:** Backend e documentos; responsável nominal a definir  
**Referências:** WP-04, E10  
**Depende de:** POC-02, POC-06

## Resultado esperado

Foto/PDF aceito pelo canal vira evidência acessível à pessoa autorizada e segue para extração e revisão.

## Ponto de partida verificado

PR #17 mesclado em c5a6bdf: validação, multipart, storage e persistência inicial. Isso não comprova o caminho 360dialog → serviço → painel, nem processamento OCR completo.

## Critérios de aceite

- [ ] Confirmar montagem da rota no serviço autenticado e conectar download da 360dialog ao recebedor persistente.
- [ ] Testar ponta a ponta foto/PDF válido, conteúdo incompatível, nome/tamanho inválido e telefone sem vínculo.
- [ ] Demonstrar concorrência, reentrega após falha e recuperação sem duplicar despesas ou deixar reservas eternas em processamento.
- [ ] Comprovar autoria/origem WhatsApp, vínculos da nota/despesa e acesso autorizado ao arquivo privado.
- [ ] Reutilizar OCR já existente; registrar resultado/proveniência e encaminhar evidência ilegível para revisão sem fabricar campos.
- [ ] Definir documentos/campos do piloto e avaliar extração com amostra controlada; apresentar confiança por campo ou indisponibilidade explícita, sem inventar pontuações. Critério de qualidade e mecanismo de confiança precisam ser homologados.
- [ ] Exercitar migração 0014 e reversão operacional compatível com a aplicação anterior em banco de teste.

## Evidência de conclusão

Vincular PRs, testes relevantes e teste manual em homologação. Quando houver
mudança de dados, autorização ou integração externa, anexar prova em banco/API
e plano de reversão. Código mesclado, homologação e habilitação produtiva são
estados distintos. Não fechar a issue apenas porque o PR foi aberto.

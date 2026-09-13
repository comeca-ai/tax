# POC-03 — Configurar política, responsáveis, tarifa e modos por empresa

**Marco:** POC 1 — Base segura e cadastros  
**Prioridade:** P0  
**Responsabilidade:** Produto e backend; responsável nominal a definir  
**Referências:** E1, E3  
**Depende de:** POC-02

## Resultado esperado

A mesma evidência produz o mesmo veredito; o modo da empresa determina quais efeitos são aplicados.

## Ponto de partida verificado

Política versionada e tabelas de parâmetros existem; a configuração completa e os modos sombra/assistido/autônomo ainda precisam ser integrados.

## Critérios de aceite

- [ ] Administrador edita parâmetros e designados da própria empresa com histórico de quem/quando/antes/depois.
- [ ] Política completa e atualizada é premissa do piloto; extração estruturada é validada por humano e rastreável ao documento/versão.
- [ ] Empresa sem configuração opera em sombra: registra a avaliação sem aplicar status ou comunicar decisão automática; confirmações operacionais são tratadas separadamente.
- [ ] Assistido exige confirmação humana; autônomo aplica somente o veredito autorizado pela política e pela configuração.
- [ ] Promoção/reversão de modo é humana e auditada; mesma entrada gera mesmo veredito nos três modos.
- [ ] Tarifa e regra de trajeto comercial são versionadas; cálculo monetário tem arredondamento definido e não usa defaults ocultos.

## Decisões a fechar durante esta entrega

- Resolver tarifa única por empresa (comentário atual do schema) versus tarifa por UF (E3/E11 do documento de entregas).
- Definir elegibilidade do percurso casa–cliente–casa, frequência de cobrança de notas e eventual consequência prevista na política. Nenhum bloqueio financeiro presumido.

## Evidência de conclusão

Vincular PRs, testes relevantes e teste manual em homologação. Quando houver
mudança de dados, autorização ou integração externa, anexar prova em banco/API
e plano de reversão. Código mesclado, homologação e habilitação produtiva são
estados distintos. Não fechar a issue apenas porque o PR foi aberto.


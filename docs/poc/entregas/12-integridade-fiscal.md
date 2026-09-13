# POC-12 — Validar notas e detectar duplicidade e inconsistência documental

**Marco:** POC 4 — Combustível e documentação fiscal\
**Prioridade:** P1\
**Responsabilidade:** Fiscal e integridade; responsável nominal a definir\
**Referências:** E8, E9\
**Depende de:** POC-11

## Resultado esperado

Notas inválidas, repetidas ou suspeitas ficam visíveis para revisão com evidências e limitações registradas.

## Ponto de partida verificado

Não há conector SEFAZ comprovado; idempotência por messageId não identifica a mesma nota enviada em outra mensagem.

**Divergência de escopo:** as jornadas de 07/09 excluem SEFAZ, enquanto E8
prevê consulta fiscal. Ver [GAPS-JORNADAS](../GAPS-JORNADAS.md). Decidir e
registrar o recorte antes do aceite; a leitura do PDF não cancela E8 por si só.

## Critérios de aceite

- [ ] Resolver formalmente a divergência SEFAZ/E8. Se consulta ficar para depois, registrar aceite do recorte e limitar a POC à conferência documental, integridade e conciliação, sem alegar consulta fiscal externa.
- [ ] Caso consulta permaneça no aceite, verificar viabilidade/cobertura e credenciais para tipos/UFs do piloto; definir retenção e evidência da consulta.
- [ ] Quando houver consulta: inexistente/cancelada vai à revisão; indisponível/não consultável é estado explícito e não aprovação/reprovação implícita.
- [ ] Detectar duplicidade por chave fiscal/hash, inclusive com outro messageId, antes de contabilizar o documento ou gerar despesa duplicada.
- [ ] Sinalizar pares semelhantes por emitente/data/itens/valor e possíveis manipulações para revisão; medir falsos positivos em amostra rotulada.
- [ ] Definir ameaça-alvo, documentos genuínos/manipulados, conjunto de teste reservado e metas de detecção e falsos positivos; apresentar confiança/limites, nunca acusação automática de fraude. Medir também falsos negativos da amostra.
- [ ] Não adicionar banco vetorial por padrão; justificar tecnologia e custo quando a avaliação demonstrar necessidade.
- [ ] Registrar critério de aceite para manipulação documental previsto em E9; se a solução for reduzida, obter aceite explícito do recorte antes de declarar E9 cumprida.

## Decisões a fechar durante esta entrega

- Selecionar acesso autorizado de consulta fiscal e método de avaliação de manipulação; não prometer cobertura universal da SEFAZ nem detecção infalível de fraude.

## Evidência de conclusão

Vincular PRs, testes relevantes e teste manual em homologação. Quando houver
mudança de dados, autorização ou integração externa, anexar prova em banco/API
e plano de reversão. Código mesclado, homologação e habilitação produtiva são
estados distintos. Não fechar a issue apenas porque o PR foi aberto.

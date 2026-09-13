# POC-12 — Validar notas e detectar duplicidade e inconsistência documental

**Marco:** POC 4 — Combustível e documentação fiscal\
**Prioridade:** P1\
**Responsabilidade:** Fiscal e integridade; responsável nominal a definir\
**Referências:** E8, E9, D-025\
**Depende de:** POC-11

## Resultado esperado

Notas inválidas, repetidas ou suspeitas ficam visíveis para revisão com evidências e limitações registradas.

## Ponto de partida verificado

Não há conector SEFAZ comprovado; idempotência por messageId não identifica a mesma nota enviada em outra mensagem.

**Divergência de escopo:** as jornadas de 07/09 excluem SEFAZ, enquanto E8
prevê consulta fiscal. Ver [GAPS-JORNADAS](../GAPS-JORNADAS.md). Em D-025, o
usuário aprovou registrar a avaliação de um integrador. O recorte definitivo
de E8 será decidido com o resultado da prova; não foi dispensado nem concluído.

## Prova técnica do integrador — decisão D-025

**Primeira opção:** Focus NFe, produto de recebimento/captura de NF-e.
**Alternativa:** NFE.io, produto de distribuição/inbound de NF-e.
Começar com uma empresa piloto, NF-e modelo 55 e documentos de combustível
conhecidos. Não presumir cobertura de NFC-e pelo mesmo produto.

- [ ] Identificar empresa, responsável fiscal, amostra e ambiente autorizado; antes de qualquer envio, aprovar o uso de dados reais, certificado e eventuais custos. Segredos não vão para Git, logs ou chat.
- [ ] Comprovar XML completo e campos necessários: chave, emitente/destinatário, data, itens, quantidades, unidades e valores; testar cancelamentos e alterações notificadas.
- [ ] Verificar certificado aceito, custódia, expiração/revogação e isolamento por CNPJ; documentar o efeito das manifestações e exigir autorização própria, sem derivá-la da aprovação de reembolso.
- [ ] Testar notificações/consultas, repetição de eventos, indisponibilidade e recuperação sem duplicar notas; conservar origem, horário da consulta e vínculo entre documento e evento.
- [ ] Demonstrar como os dados alimentam POC-13 e regularizam POC-14. CNPJ sozinho não associa nota a vendedor/veículo/jornada; manter vínculo operacional e revisão de ambiguidades.
- [ ] Confirmar custo da captura total do CNPJ, não apenas combustível: franquia, excedentes, histórico, suporte, orçamento do piloto e condições contratuais para uso no nosso sistema com múltiplos clientes.
- [ ] Registrar evidências, limitações e recomendação de seguir ou não com Focus; avaliar NFE.io se Focus não atender. Fechar o recorte E8 antes do aceite final, sem considerar o teste isolado como homologação de toda esta entrega.

Registrar esta prova no plano não autoriza contratação, abertura de conta,
transferência de certificado, manifestação fiscal ou ativação produtiva.
Não há integração habilitada por esta alteração documental.

Referências da pesquisa de 13/09/2026:
[recebimento Focus NFe](https://focusnfe.com.br/produtos/manifestacao-destinatario-mde/),
[planos Focus](https://focusnfe.com.br/precos/) e
[distribuição NFE.io](https://nfe.io/docs/desenvolvedores/rest-api/nfse-inbound-v2/dfedistribution-inbound-api/).
Preços, condições e cobertura serão reconfirmados antes da contratação.

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

- Homologar ou rejeitar o integrador após a prova, autorizar seu acesso e fechar o recorte E8; definir separadamente o método de avaliação de manipulação E9. Não prometer cobertura universal da SEFAZ nem detecção infalível de fraude.

## Evidência de conclusão

Vincular PRs, testes relevantes e teste manual em homologação. Quando houver
mudança de dados, autorização ou integração externa, anexar prova em banco/API
e plano de reversão. Código mesclado, homologação e habilitação produtiva são
estados distintos. Não fechar a issue apenas porque o PR foi aberto.

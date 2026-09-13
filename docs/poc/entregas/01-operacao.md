# POC-01 — Preparar homologação, governança e reversão

**Marco:** POC 1 — Base segura e cadastros  
**Prioridade:** P0  
**Responsabilidade:** Operação; responsável nominal a definir  
**Referências:** condições comuns, E12  
**Depende de:** nenhuma entrega anterior

## Resultado esperado

Ter ambiente de homologação e processo de publicação verificáveis, com responsáveis e revisão identificados.

## Ponto de partida verificado

Existe CI de lint, tipos, testes e build. O runbook registra instalação atual em systemd; não presumir Docker como ambiente implantado. A proteção da main precisa ser conferida novamente no GitHub.

## Critérios de aceite

- [ ] Registrar empresa piloto, responsáveis por produto/técnica/operação e métricas-alvo; começar com uma empresa e dados de teste.
- [ ] Definir quem executa e quem aprova arquitetura, homologação e eventual implantação; o PDF de jornadas não autoriza contratação da K2 nem muda a construção interna de D-021.
- [ ] Preparar runbook para equipe interna localizar casos/falhas e repetir o ensaio; definir acesso e responsabilidade pelo reprocessamento seguro.
- [ ] Conferir proteção de main/tags e documentar checks e revisões exigidos; tratar configuração como ação própria desta issue, sem alterar regras durante a publicação do roadmap.
- [ ] Homologação usa banco, domínio, segredos e flags próprios; habilitação do canal é explícita.
- [ ] Documentar e ensaiar backup/restauração e rollback da aplicação no ambiente realmente usado (systemd, conforme runbook atual).
- [ ] Comprovar health check, autenticação, migrações compatíveis e evidência anexada antes de cada promoção.

## Decisões a fechar durante esta entrega

- Identificar os responsáveis nominais e o ambiente piloto; datas só após estimativa das entregas.

## Evidência de conclusão

Vincular PRs, testes relevantes e teste manual em homologação. Quando houver
mudança de dados, autorização ou integração externa, anexar prova em banco/API
e plano de reversão. Código mesclado, homologação e habilitação produtiva são
estados distintos. Não fechar a issue apenas porque o PR foi aberto.

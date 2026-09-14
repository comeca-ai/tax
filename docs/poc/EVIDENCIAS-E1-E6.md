# Evidências E1–E6 e ligação com E11 — 13/09/2026

Fonte de aceite: `/root/k2/Doze Entregas da PoC - reembolsa.docx`, entregas E1–E6 e condições comuns. Esta matriz registra implementação e testes locais; não constitui aceite contratual nem prova de produção.

| Entrega | Evidência disponível | Pendência de aceite |
| --- | --- | --- |
| E1 modos | `aplicarModo` conserva o veredito, assume sombra sem configuração e controla efeitos; teste de domínio. `campo.configurar` grava configuração e log append-only na mesma transação, com autor, data do log, modo anterior/novo e versão da política. Teste da API simulado prova autorização e conteúdo do evento. | Ensaio real nos três modos e reversão da promoção no canal/banco não executados por este agente. |
| E2 fila | Guardas e designações já existem em `_shared.ts`, fila em `revisao.ts`; edição e validação são responsabilidade da frente de integração. | Não declarar isolamento API+banco aceito apenas por presença de filtros. Conferir evidências da frente principal. |
| E3 configuração | API passa a aceitar tarifas por UF em centavos/km, vale-refeição, contrato corporativo de transporte, Analista e Aprovador. Designação exige colaborador ativo da própria empresa na API; persiste em `empresas_config`, que possui FKs compostas. Tarifa por UF é explícita, sem fallback para valor global legado. Testes cobrem rejeição de designado não encontrado na consulta do tenant, tarifa por UF e arredondamento. | Teste real de FK deve ser avaliado na suíte de banco. Flags são persistidas, mas consumo delas pelo decisor de política não foi implementado nesta frente. Prova visual e preenchimento real da seção 2.5 dependem da interface/homologação. |
| E4 veículo unificado | Frente principal assumiu schema, API e teste de banco. | Consultar relatório principal; esta frente não atesta cadastro ou integração fiscal de veículo. |
| E5 lote/hierarquia | Cadastro individual e convite por ação explícita já existem. | Importação com resumo/validação linha a linha, CLT/MEI/PJ e superior direto não estão entregues por esta rodada. Não há teste de aceite de planilha. |
| E6 régua | Pagamento exige ação de administrador, despesa aprovada e data não futura; registro idempotente separado em `poc_pagamentos`. Acrescentado evento `despesa.registrar_pagamento` no log, na mesma transação. | A despesa conserva status `aprovada`; não há estado `paga` no enum nem cinco dimensões por empresa/período ou amostragem de auditoria. E6 não está integralmente aceita. |

## Ligação E3 → E11

`campo.conciliar` aceita opcionalmente `ufCalculo` e `metrosComerciais`, obrigatoriamente juntos. A API rejeita classificação comercial superior à distância reconstruída e não presume que todo trajeto seja comercial. Com política ativa e tarifa explícita da UF, persiste memorial contendo distância comercial e não comercial segregadas, tarifa em centavos/km, valor arredondado em centavos e identificação/versão da política. Sem classificação, permanece apenas a conciliação documental, sem valor de reembolso.

Regularização documental preserva o memorial se a distância continuar idêntica; mudança de distância invalida o memorial atual e conserva a versão anterior no histórico para nova classificação humana. Isso calcula base estimada e não cria pagamento nem aprovação automática.

Limitação: classificação comercial é declaração explícita do administrador na conciliação; não é inferida automaticamente por geolocalização. Roteirização real e integração dessa distância na despesa fiscal exigem validação da frente principal e provedor configurado.

## Validação local

- `api/modules/reembolso/campo/politica.test.ts`: tarifa por UF, arredondamento, UF/tarifa inválida, flags e designação anulável.
- `api/routers/campo.governanca.test.ts`: autorização antes da transação, designação recusada antes de escrita, conteúdo da trilha da promoção, pagamento manual idempotente com trilha e bloqueio sem aprovação.
- `api/routers/campo.memorial.test.ts`: memorial persistido no agregado simulado, segregação, ausência de classificação, limite de distância e UF sem tarifa.
- `api/modules/reembolso/campo/dominio.test.ts` e demais testes campo: regressão do fluxo existente.

Os testes de API acima usam banco simulado; não substituem a prova de isolamento no banco real exigida em K2. Nenhum deploy, mensagem, consulta a provedor pago ou uso de credenciais foi realizado por esta frente.

Resultado executado às 17:55 UTC: **6 arquivos / 38 testes passaram** (`npx vitest run api/routers/campo.governanca.test.ts api/routers/campo.memorial.test.ts api/modules/reembolso/campo`). Typecheck global passou às 17:53 UTC; ESLint dos arquivos desta frente passou às 17:54 UTC. A integração principal deve conservar também o resultado do check final após todas as frentes.

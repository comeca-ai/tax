# Roadmap da POC — campo e conciliação de combustível

Planejamento consolidado em 13/09/2026. Escopo acordado na conversa e na reunião
de produto de 08/09/2026. Este documento organiza entregas; não declara
funcionalidades futuras como implementadas.

## Objetivo e condição de conclusão

Provar com uma empresa piloto o ciclo: política validada → equipe ativada na
360dialog → despesas decididas/revisadas → jornada de campo registrada →
quilometragem consolidada posteriormente → notas de combustível no CNPJ do
empregador → conciliação por período → cobrança e regularização de pendências →
métricas e aceite.

O aceite do canal de comprovantes (WP-07) é um marco intermediário. A POC
completa exige também campo, combustível e o ensaio final POC-16, conforme D-023.
Reembolso por km, pagamento registrado e análise fiscal têm estados próprios.
Documento no CNPJ do empregador não é confirmação de crédito tributário.

[Desenho da topologia e estado atual](TOPOLOGIA.md) ·
[Revisão de hierarquia e política](REVISAO-HIERARQUIA.md) ·
[Lacunas das jornadas B2B/B2C](GAPS-JORNADAS.md) ·
[Imagem da topologia](topologia-poc.svg) ·
[Plano anterior do canal WhatsApp](../whatsapp-poc/README.md) ·
[Decisões](../DECISOES.md) · [Política de release](../POLITICA-DE-RELEASE-E-DEPLOY.md)

## Estado verificado no repositório

- PRs #13 a #16 integraram plano, filas, API de serviço e identificação.
- PR #17 foi mesclado em `c5a6bdf`: validação, upload multipart, armazenamento e
  persistência inicial de comprovantes. A revisão do fluxo completo é POC-07.
- Existem web/back office, política versionada, decisor, revisão, OCR e motor
  fiscal. Permanecem lacunas de integração e aceite.
- `checkins_campo` existe como estrutura de armazenamento de posições. Jornada,
  comandos de campo, Google Maps, conciliação e cobrança ainda são entregas.
- A integração 360dialog recebe eventos, mas o worker produtivo e o desligamento
  dos caminhos legados ainda precisam ser implementados.
- As 17 issues abaixo representam trabalho pendente, inclusive integração e
  homologação de bases já disponíveis. Nenhuma está concluída neste documento.

## Regra transversal — ajustes mantendo o padrão

Adição solicitada pelo usuário em 13/09/2026: os ajustes necessários em
frontends, chaves, endpoints e integrações fazem parte da implementação da POC,
preservando o padrão visual e técnico do projeto. Esta regra não declara as
entregas concluídas nem amplia a autorização para custos ou alterações em produção.

- Frontend: reutilizar componentes, tokens, tipografia e navegação do painel;
  manter autenticação, permissões, seleção de empresa e estados reais de
  carregamento, vazio e erro. O ZIP é referência visual, não substitui a aplicação
  por um protótipo com dados ou ações simulados.
- Backend e integrações: manter contratos, validação, isolamento por empresa,
  idempotência e convenções existentes. Mudanças incompatíveis exigem migração
  explícita e documentada, sem fallback silencioso de credenciais.
- Chaves: usar configuração de servidor e armazenamento de segredos; nunca
  incluir valores no frontend, Git, documentação ou logs. Mudança de nome não
  comprova rotação nem revogação de uma credencial.
- Verificação: incluir testes unitários e de regressão dos comportamentos
  alterados; validar a integração e as telas em homologação. Registrar evidências,
  limitações e procedimentos de reversão antes de declarar aceite.
- Coordenação: os agentes responsáveis por frontend, transporte/segurança e
  campo/combustível aplicam esta regra; a integração final revisa os contratos
  entre as frentes. Ajustes não autorizam compras, serviços pagos ou remoção de
  controles de segurança para cumprir o prazo.

### Limite autorizado para testes externos

Em 13/09/2026, o usuário autorizou chamadas em até 20 testes. Para controle
conservador, cada chamada externa de teste consome uma unidade desse limite,
inclusive retentativas e chamadas adicionais dentro do mesmo cenário. Testes
unitários locais com respostas simuladas não consomem essa cota. O coordenador
centraliza as execuções e registra cenário, horário, resultado e saldo, sem
credenciais ou dados pessoais nos registros. Esgotado o limite, novas chamadas
exigem autorização; a autorização quantitativa não confirma gratuidade nem
autoriza compra de créditos ou contratação de serviços.

## Cinco marcos

| Marco | Resultado | Entregas |
|---|---|---|
| M1 — Base segura e cadastros | Isolamento, política, modos, equipe, veículo e hierarquia normativa | POC-01 a POC-05 e POC-17 |
| M2 — Canal único 360dialog | Recebimento durável, comprovantes, conversa e decisão | POC-06 a POC-08 |
| M3 — Jornada e Google Maps | Saída, visitas, retorno e consolidação posterior | POC-09 e POC-10 |
| M4 — Combustível e fiscal | Nota validada, conciliação e cobrança de pendências | POC-11 a POC-14 |
| M5 — Medição e aceite | Indicadores, pagamento registrado e ensaio completo | POC-15 e POC-16 |

P0 significa necessário ao caminho principal. P1 significa execução após seus
pré-requisitos; POC-12 continua obrigatória para o aceite do escopo de integridade,
salvo alteração de escopo expressamente aceita. A ordem entre marcos indica
resultado, não uma exigência de executar todas as tarefas em série: cadastros,
canal e documentação fiscal podem avançar conforme suas dependências.
Instrumentação de eventos começa em cada entrega, antes do painel POC-15.

## Backlog executável

Cada entrega detalha ponto de partida, resultado, testes de aceite, dependências
e papel responsável. Responsáveis nominais, datas e estimativas ainda precisam
ser definidos; não foram atribuídos automaticamente.

| ID | Entrega | Marco / prioridade | Dependências |
|---|---|---|---|
| [POC-01](entregas/01-operacao.md) | Preparar homologação, governança e reversão | M1 · P0 | — |
| [POC-02](entregas/02-isolamento.md) | Provar identidade, isolamento e reentrega segura na API e no banco | M1 · P0 | POC-01 |
| [POC-03](entregas/03-politica-modos.md) | Configurar política, responsáveis, tarifa e modos por empresa | M1 · P0 | POC-02 |
| [POC-04](entregas/04-onboarding-equipe.md) | Ativar equipe pelo WhatsApp e classificar interno/externo | M1 · P0 | POC-02, POC-03 |
| [POC-05](entregas/05-veiculos.md) | Unificar veículo e consumo declarado do colaborador | M1 · P0 | POC-02 |
| [POC-06](entregas/06-transporte-360dialog.md) | Conectar 360dialog à inbox/outbox e desativar caminhos legados | M2 · P0 | POC-02 |
| [POC-07](entregas/07-comprovantes.md) | Homologar comprovantes integrados e conectar OCR existente | M2 · P0 | POC-02, POC-06 |
| [POC-08](entregas/08-conversa-decisao.md) | Concluir conversa, pendências de evidência e retorno da decisão | M2 · P0 | POC-03, POC-04, POC-06, POC-07, POC-17 |
| [POC-09](entregas/09-jornadas-campo.md) | Registrar check-in, checkpoints e check-out com jornada persistente | M3 · P0 | POC-02, POC-04, POC-06 |
| [POC-10](entregas/10-consolidacao-maps.md) | Consolidar jornadas posteriormente com Google Maps | M3 · P0 | POC-03, POC-05, POC-09 |
| [POC-11](entregas/11-notas-combustivel.md) | Receber notas de combustível no CNPJ do empregador | M4 · P0 | POC-02, POC-05, POC-07 |
| [POC-12](entregas/12-integridade-fiscal.md) | Validar notas e detectar duplicidade e inconsistência documental | M4 · P1 | POC-11 |
| [POC-13](entregas/13-conciliacao-combustivel.md) | Conciliar jornada, quilômetros, veículo e notas por período | M4 · P0 | POC-03, POC-05, POC-10, POC-11, POC-12 |
| [POC-14](entregas/14-cobranca-notas.md) | Cobrar notas pendentes pelo WhatsApp e encerrar lembretes ao regularizar | M4 · P0 | POC-06, POC-08, POC-13 |
| [POC-15](entregas/15-metricas-pagamento.md) | Medir o piloto e registrar pagamento com autoria | M5 · P0 | POC-03, POC-08 |
| [POC-16](entregas/16-aceite-final.md) | Executar aceite ponta a ponta e preparar release da POC completa | M5 · P0 | Todas as demais entregas, incluindo POC-17 |
| [POC-17](entregas/17-hierarquia-alcadas.md) | Extrair da política cargos, responsabilidades e condições de aprovação | M1 · P0 | POC-02, POC-03, POC-04 |

## Mapeamento dos planos anteriores

| Referência | Cobertura no novo roadmap |
|---|---|
| E1 — modos | POC-03 |
| E2 — revisão/isolamento | POC-02, POC-03, POC-08, POC-17 |
| E3 — parâmetros | POC-03, POC-17 |
| E4 — veículo | POC-05, POC-13 |
| E5 — equipe em lote/hierarquia | POC-04, POC-17 |
| E6 — métricas/pagamento | POC-15 |
| E7 — chave fiscal | POC-11 |
| E8 — consulta fiscal | POC-12 |
| E9 — integridade/antifraude | POC-12 |
| E10 — WhatsApp | POC-04, POC-06, POC-07, POC-08, POC-14 |
| E11 — campo/km | POC-09, POC-10, POC-13 |
| E12 — homologação | POC-01, POC-16 |
| WP-00 a WP-03 — fundações integradas | POC-02, POC-06 comprovam integração |
| WP-04 — comprovantes, PR #17 integrado | POC-07 completa homologação |
| WP-05/WP-06 — conversa e decisão | POC-08 |
| WP-07 — aceite do canal | POC-08 e POC-16 distinguem marco e aceite global |

## Decisões de produto preservadas

1. Canal WhatsApp exclusivo pela **360dialog**; aplicação e banco permanecem na
   infraestrutura própria, em módulos do mesmo repositório.
2. Check-in/checkpoints/check-out são eventos persistentes. O cálculo de rota
   acontece depois; os pontos enviados são evidências de origem.
3. Google Maps estima trajetos entre pontos na ordem registrada. Não comprova
   o caminho efetivo nem permite descobrir toda visita omitida.
4. Conciliação reúne jornada, veículo e notas por período. Um abastecimento pode
   cobrir vários dias; litros comprados não são consumo medido.
5. Cobrança pede documentação pendente no CNPJ do empregador e cessa após
   regularização. Não é cobrança monetária nem uma mensagem a cada checkout.
6. Política da empresa governa direitos, tarifa, percurso comercial e eventual
   consequência da falta de nota. Classificar interno/externo orienta o fluxo,
   sem conceder ou retirar direito por si só.
7. IA auxilia extração. Decisor determinístico, política e revisão humana
   governam o resultado. A política não é alterada por aprendizado do agente.
8. Cargos, responsabilidades e condições de aprovação vêm da política (D-024).
   A interpretação é validada e vinculada ao cadastro real. Com trajeto elegível,
   evidências suficientes e regra/modo autorizando, o decisor aplica aprovação
   automática; revisão humana ocorre quando exigida ou diante de pendências.
9. Prova técnica fiscal por integrador (D-025): **Focus NFe primeiro; NFE.io
   como alternativa**, dentro de POC-12. Testar uma empresa e NF-e modelo 55,
   XML/itens/eventos, certificado/manifestações, custos e uso multiempresa.
   Trata-se de avaliação planejada, sem contratação ou integração ativada;
   o resultado fundamenta a decisão sobre o recorte E8 no aceite.

## Decisões abertas com entrega responsável

| Escolha a resolver | Responsável no backlog |
|---|---|
| Tarifa única versus por UF; casa–cliente–casa e uso misto | POC-03 |
| Limites das perguntas de contexto versus preencher dados da nota | POC-08 |
| Interpretação dos perfis/responsabilidades e vínculo com pessoas reais | POC-17 |
| Período de conciliação, prazos, estoque de tanque e limiares | POC-03, POC-13, POC-14 |
| Acesso/retenção de localização e campos realmente fornecidos pelo canal | POC-04, POC-09 |
| Serviço Google, orçamento e retenção permitida dos resultados | POC-10 |
| Cobertura da consulta fiscal, manipulação documental e avaliação de falsos positivos | POC-12 |
| Homologação do integrador e recorte E8 no aceite após a prova Focus NFe / alternativa NFE.io (D-025) | POC-12, POC-16 |
| Empresa piloto, responsáveis e metas de sucesso | POC-01, POC-15 |

## Portão de aceite

- [ ] Todas as entregas aplicáveis estão homologadas e ligadas a evidências.
- [ ] Uma empresa executa o fluxo completo, incluindo múltiplas visitas e cobrança de nota.
- [ ] O mesmo caso conecta WhatsApp e backoffice; a equipe interna repete o roteiro com evidências correlacionadas.
- [ ] OCR e sinais de manipulação são avaliados em conjunto controlado; divergência de escopo SEFAZ está resolvida explicitamente.
- [ ] Falhas e reentregas não perdem eventos, duplicam valores ou expõem outra empresa.
- [ ] Sombra, assistido e autônomo são testados em ambiente controlado; promoção e reversão demonstradas.
- [ ] Métricas e amostra auditada são aceitas pelos responsáveis.
- [ ] Nenhum defeito bloqueante permanece; limitações/recortes têm aceite explícito.
- [ ] Tag, artefato, backup, procedimento de implantação e rollback são revisados.

## Depois da POC

PIX e execução financeira, integração ERP, eSocial, portal do contador, dossiê
completo em pacote, motor fiscal além de combustível e seleção de múltiplas
empresas pelo mesmo telefone continuam fora deste ciclo. Uma plataforma
avançada de forense/vetores não é exigida por padrão; o aceite mínimo de E9
precisa ser resolvido em POC-12, não simplesmente omitido.

## Organização no GitHub

O manifesto [backlog.json](backlog.json) alimenta a publicação de cinco
milestones, um épico e 17 issues com dependências por links. Os títulos possuem
IDs estáveis para permitir reexecução sem duplicar tarefas. Issues existentes
não são fechadas, reabertas ou atribuídas a pessoas automaticamente.

A publicação inicial foi executada na branch documental
`docs/360dialog-canal-unico` com o token temporário do próprio GitHub Actions.
O workflow remanescente não roda mais em `push`: uma eventual republicação é
manual, exige confirmação explícita e mantém os gates internos da branch. Ele
não faz merge, deploy ou alteração de proteção da main. O arquivo
[publicacao-github.json](publicacao-github.json) é a evidência histórica daquela
execução; uma falha nesse relatório não representa criação bem-sucedida.

## Fontes de escopo

- Reunião de produto de 08/09/2026: onboarding/classificação e checkpoints
  (00:00–00:05), combustível separado do reembolso (00:16–00:27),
  integridade documental (00:38–00:42), Google Maps para a POC (00:44).
- Documento “Doze Entregas da PoC”: E1–E12, condições comuns e exclusões.
- “Jornadas B2B e B2C da PoC”, versão de 07/09/2026, cinco páginas:
  experiência integrada, critérios de teste e handover; divergências registradas
  em [GAPS-JORNADAS](GAPS-JORNADAS.md), sem substituir decisões posteriores.
- Decisões posteriores do usuário: somente 360dialog; consolidar eventos de
  campo depois; conciliar combustível e cobrar notas no CNPJ do empregador.
- Histórico do repositório e módulos inspecionados em 13/09/2026.

Os arquivos originais da reunião e seus dados pessoais não são copiados para o Git.

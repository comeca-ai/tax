# Prometido × entregue — reavaliação e satisfação dos critérios

Registro: 13/09/2026, 18:02 UTC. Responsável pelo registro: **Codex — agente executor de IA**.

## Resultado

**Entrega integral não demonstrada: 0 de 12 entregas com todos os critérios de aceite comprovados.**
Esse número mede aceite completo, não ausência de implementação. Não há base para
atribuir percentual de satisfação do usuário; somente o usuário pode avaliar sua
satisfação. A matriz abaixo avalia atendimento técnico ao combinado.

O prazo comunicado foi 18h. O fuso não foi confirmado; o coordenador adotou
18:00 UTC como limite conservador. Nesse horário a integração local tinha avanços,
mas o escopo integral, a publicação e a homologação real não estavam concluídos.
Logo, o compromisso de entrega completa não pode ser registrado como cumprido.

## Referências e limite da comparação

- Escopo primário: `k2/Doze Entregas da PoC - reembolsa.docx`, E1–E12, incluindo condições comuns de aceite.
- Complemento: reconciliação K2, que exige tarifa/veículo acessíveis e ponte da quilometragem para plausibilidade fiscal.
- Auditoria fornecida pelo usuário: reavaliação de `main @ 5f3484e`, de 13/09/2026. Seus achados foram recebidos nesta conversa.
- Trabalho inspecionado: `feat/poc-homologacao-integrada`, base `1eab6fe`, mais alterações locais desta rodada. Não é a mesma versão da auditoria.
- Não foram consultadas novamente todas as issues/PRs no GitHub. A afirmação de 0/17 issues encerradas é atribuída à auditoria recebida, não a uma consulta remota desta rodada.
- Correção no workspace, commit, CI remoto, deploy e aceite são etapas diferentes. As correções abaixo não foram comprovadas em produção.

## Doze entregas K2

| Entrega prometida | Implementação/evidência local | Falta para satisfação integral | Resultado |
|---|---|---|---|
| E1 — modos por empresa | Decisor comum; sombra por padrão; decisão e modo gravados; teste SQL dos três modos; configuração com trilha transacional | Demonstrar promoção/reversão e efeitos completos no canal real e nos demais caminhos de despesa | Parcial |
| E2 — revisão e aprovador | Fila, designação e delegação existentes; validações por empresa | Corrigir acesso amplo e vínculo desligado; prova completa API+banco e hierarquia | Parcial, bloqueante |
| E3 — configuração | Interface/API com tarifas UF, benefícios, designados ativos; memorial usa tarifa explícita e política versionada | Consumo dos benefícios pelo decisor e prova integrada dos parâmetros da seção 2.5 | Parcial |
| E4 — veículo unificado | Nova API e tela: placa, RENAVAM, motorização, UF e km/L; FK composta e unicidade; teste SQL/API passou | Migrar/reconciliar cadastros legados e comprovar consumo fiscal/ponte km; aceite em homologação | Parcial |
| E5 — equipe em lote/hierarquia | Cadastro individual e convite explícito | Planilha com prévia sem escrita, erros por linha, CLT/MEI/PJ, superior direto | Não entregue no escopo exigido |
| E6 — régua de sucesso | Pagamento manual idempotente com autoria e trilha; indicadores parciais de campo | Cinco dimensões por empresa/período, amostragem e representação completa do estado paga | Parcial |
| E7 — chave fiscal | OCR e validação de chave; evidência sintética e importação documental de campo | DANFE/NFC-e reais e persistência universal independente de contexto de jornada/veículo | Parcial |
| E8 — consulta ao fisco | Adapter NFE.io, consulta administrativa com orçamento e persistência; testes sintéticos | Consulta no envio, efeito explícito dos estados fiscais, evidência real e cobertura necessária | Não entregue como prometido |
| E9 — integridade/antifraude | Duplicata binária bloqueada antes da despesa WhatsApp; teste SQL real; índices de documento | Duplicata semântica, imagem manipulada, chave em arquivos distintos em todos os caminhos e taxa de falso positivo rotulada | Parcial |
| E10 — WhatsApp produtivo | Rota montada, canal oficial, identidade, worker, OCR→decisor→modo→resposta persistida; teste SQL sintético | Foto/resposta reais no número homologado; credencial/webhook runtime; token de serviço por tenant | Parcial, bloqueante |
| E11 — campo/quilometragem | Pontos, Routes API, memorial UF e segregação comercial; Compose passa chave/flag Maps | Conferir secret no runtime, jornada real, tarifa/memorial e ponte ao motor fiscal | Parcial |
| E12 — ensaio ponta a ponta | Suítes locais e navegador sintético com evidências | E1–E11 aceitas, dados autorizados de empresa, três modos, promoção/reversão e nenhum bloqueante | Não entregue |

As 17 issues do roadmap interno detalham esses resultados e extensões; não são
17 entregas adicionais que permitam substituir ou reduzir os 12 critérios K2.

## Revalidação dos achados de segurança

| ID | Resultado da inspeção atual | Evidência / consequência |
|---|---|---|
| S1 seed | Confirmado no código | `docker-entrypoint.sh` executa seed sem gate específico; `db/seed.ts` cria contas fixas. Remover a tabela do README não corrige isso. Não inspecionamos contas de produção. |
| S2 sessão | Confirmado | `session.ts` usa uid/exp; troca/reset não invalida tokens existentes. |
| S3 tentativas | Confirmado na aplicação | Não há rate limit/lockout identificado nas rotas auth. Proxy externo não foi verificado. |
| S4 segredo vazio | Confirmado fora de produção | `env.ts` só exige valor em produção; assinatura aceita vazio em outros ambientes. |
| S5 token plataforma | Confirmado | `servicoAuth.ts` autentica token global; vínculo pessoa/empresa é validado, mas não o tenant autorizado pelo token. Também afeta identificação por telefone. |
| S6 legados | Corrigido localmente | `boot.ts` responde 410 nos dois caminhos antigos. Não há comprovação de deploy dessa versão. |
| S7 credenciais expostas | Pendente operacional | Revogação não comprovada. Busca inicial por alguns padrões no histórico local não prova ausência de vazamento e não verifica todos os tokens anteriores. |
| S8 webhook | Durabilidade/deduplicação corrigidas localmente | `dialog360.ts` grava transação antes do ACK; erro/timeout retorna 503. Isso não significa aceite externo completo. |
| S9 papéis/desligado | Confirmado | `_shared.ts` permite leitura ampla ao revisor e consultas de vínculo sem filtrar desligamento. |
| S10 reset em log | Confirmado | `auth.ts` registra URL/token de reset quando não há envio SMTP. |
| S11 terceiros/retenção | Não encerrado por esta revisão | Auditoria recebida aponta envio a provedores e retenção; não foi realizada avaliação jurídica ou inventário completo nesta rodada. |
| S12 upload | Não revalidado integralmente | Divergência de limites/MIME informada pelo usuário permanece pendente de inspeção específica. |

## Correções da divergência prometido/executado

- PR #17: a rota de comprovantes, ausente na base auditada, está montada no código local em `POST /api/v1/despesas`; segurança do token continua parcial.
- Canal/fila: há worker local consumindo mídia, decidindo e enfileirando resposta. Isso supera a estrutura sem processamento da base auditada, mas não prova entrega real no WhatsApp.
- README: URL do repositório, tabela de credenciais e instruções Evolution corrigidas parcialmente. As demais seções históricas ainda exigem revisão completa.
- Google Maps: identificada e corrigida ausência de chave/flag no Compose. A chave informada pelo usuário como existente em Secrets não foi lida, exibida ou confirmada no processo do servidor. Workflow novo verifica presença, sem chamar o Google, e ainda não foi executado no GitHub.
- Hierarquia, consulta fiscal automática, métricas e antifraude avançada continuam incompletas. Não foram reclassificadas como entregues por haver testes em módulos adjacentes.

## Evidências e falhas da rodada

- Primeira validação: 646 testes passaram, lint/tipos/build passaram; oito testes não executados.
- Após integração: **13 testes SQL passaram**, incluindo três modos WhatsApp, replay, duplicação documental e vínculo de veículo/API/FK.
- A migração E4 inicialmente falhou pela ordem errada das colunas da FK composta. O teste SQL detectou a ausência da restrição. A ordem foi corrigida e o teste passou. A falha e sua correção não foram ocultadas.
- Suíte geral intermediária: 675 testes passaram e um teste antigo falhou por exigir exatamente oito colunas em `veiculos`. O teste foi atualizado para preservar os oito campos anteriores e exigir novos campos opcionais; validação final concluída: **679 testes passaram, 10 não executados; tipos, lint e build passaram**. Os 13 testes SQL foram executados separadamente e passaram; contagens não devem ser somadas como casos únicos.
- Navegador anterior: oito verificações, nove capturas e limpeza; antecede os formulários novos e não os comprova.
- Testes de Maps: 19 passaram, com credenciais sintéticas e sem chamada ao provedor.

## Compromisso de correção

O trabalho continua devido: fechar os bloqueios de segurança e as lacunas da
matriz; consolidar versão revisável; obter CI e homologação; registrar resultado
real de cada critério. Não substituir esses passos por encerramento de issues ou
por um percentual estimado de conclusão. Não anunciar entrega integral enquanto
E12 estiver sem demonstração.

Falha assumida pelo coordenador: não recuperar cronograma/compromissos na primeira
retomada e não apresentar desde o início a distância entre testes locais e aceite.
Este registro não atribui autoria de alterações históricas sem evidência.

**Assinado: Codex — agente executor de IA.** Assinatura textual do autor do
relatório, sem representação jurídica da OpenAI.

Referências locais: [responsabilidade](RELATORIO-RESPONSABILIDADE-2026-09-13.md),
[E1–E6](EVIDENCIAS-E1-E6.md), [E7–E10](EVIDENCIAS-E7-E10.md),
[interface/E11–E12](EVIDENCIAS-INTERFACE-E11-E12.md), [Maps](GOOGLE-MAPS-CAMPO.md).

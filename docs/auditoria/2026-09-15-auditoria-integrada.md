# Auditoria integrada — Reembolsa — 15/09/2026

Responsável: Codex, com três agentes nas frentes de segurança, interface e aceite. Consolidação às 01:10 UTC. Revisão automatizada assistida por leitura de código; não constitui aceite humano.

## Conclusão executiva

O candidato possui implementação ampla e suíte local aprovada, mas contém três falhas prioritárias de comportamento: modos não aplicados nas despesas web, confirmação de créditos na aprovação humana sem consultar a verificação fiscal e deduplicação insuficiente entre uploads. A correção do menu de checkpoints também possui risco de corrida durante carregamento e não foi diretamente coberta pelo teste de navegador citado anteriormente.

A homologação respondeu por HTTPS nesta auditoria e seu manifesto identifica o commit atual. A falha anterior de DNS era uma limitação do sandbox; não comprova indisponibilidade pública. Publicar novamente o menu não resolve os problemas funcionais encontrados.

## Base e evidências atuais

- Checkout: `deploy/checkpoints-menu-20260915`, commit `7f11af74e0846e7c1868f9719366f5b5e6f3fbb6` (PR #54 no histórico local).
- Antes da auditoria, nenhum arquivo rastreado estava modificado; havia duas pastas de evidência browser não versionadas. Foram preservadas.
- [Manifesto público](https://homolog.oreembolsobot.app/release.json), consultado nesta rodada: candidato `1.14.0-rc.20260915t000927z`, base `7f11af7`, SHA-256 declarado do backend `94f3d146abcd7df256199df45c08ec4333162ce9641126fbcf312cc1ec36f106`.
- O manifesto declara `sourceIncludesUncommittedChanges:true`, `remoteCiVerified:false` e `productionApproved:false`. Esses campos impedem tratar somente a base Git como prova de release imutável e aprovada. O backend remoto não foi baixado para recalcular seu hash.
- [Saúde pública](https://homolog.oreembolsobot.app/api/health): `ok:true`, timestamp retornado `2026-09-15T01:06:15.012Z`. Demonstra resposta da aplicação; não exercita login, checkpoints ou provedores.
- Consulta anônima dos checks do commit na API GitHub: HTTP 404. Resultado inconclusivo para CI; não prova ausência de execução ou falha do pipeline.
- O manifesto informa 745 testes, 20 ignorados e 23 SQL, contagens diferentes da suíte atual. Não as reutilizar como execução atual nem inferir erro do build só pela diferença.

## Verificação

| Verificação | Resultado e limite |
| --- | --- |
| `env -u POC_TEST_DATABASE_URL npm test -- --reporter=dot` | **841 aprovados, 39 ignorados**; 100 arquivos aprovados, 4 ignorados; 31,80 s; início 01:02:53 UTC. Banco de integração não habilitado. |
| TypeScript, lint, build | Aprovados na mesma sessão antes desta auditoria; agentes repetiram TypeScript e testes focais. Build com avisos de tamanho e Browserslist. Não somar testes focais aos 841. |
| Guards de isolamento da homologação, navegador e consulta 360dialog | Três arquivos de checks passaram, com respostas/dados sintéticos. |
| Checks de configuração WhatsApp e segurança dos workflows | **43/43 aprovados** na repetição autorizada fora do sandbox, em 3,48 s. Primeira execução falhou por `spawnSync /usr/bin/node EPERM`, resolvido ao permitir subprocessos. Não houve falha de código confirmada nesses checks. Isso não substitui CI remoto. |
| Contratos de upload | Reprodução sem banco/rede confirmou `uploadInvalidoAceito:true` para base64 `%%%` com MIME `image/png` e `evidenciaSemArquivoAceita:true` para evidência sem conteúdo. |
| Browser anterior `browser-e3ebde23-8727-4d74-af8b-a8b7f986f8a3` | Oito checks gerais locais aprovados, zero erros; sessão injetada, rede externa bloqueada. Não testa clique/âncora, erro/retry ou troca de empresa na seção de checkpoints. |

## Achados por impacto

P1: corrigir antes de aceite/promoção; P2: corrigir na estabilização e provar o comportamento afetado. Achados de código descrevem caminhos possíveis; não afirmam ocorrência com dados reais nesta auditoria.

### A1 — P1 — painel ignora modo sombra/assistido nas despesas

[`despesas.ts:225`](../../api/routers/despesas.ts#L225) calcula `statusFinal` em `create` e o persiste em `:267`; `processarAutomatica` faz o mesmo em `:424–433,506`. Não consultam `pocConfiguracao` nem aplicam `aplicarModo`. O WhatsApp aplica o modo vinculado à versão da política em [`decisaoComprovante.ts:35`](../../api/modules/reembolso/whatsapp/decisaoComprovante.ts#L35).

**Impacto:** configurar sombra/assistido não impede aprovação/rejeição automática pelo painel quando as regras permitem. Isso afeta o status da despesa; não há prova de pagamento financeiro automático.

**Fechamento:** teste da mesma política/nota nos três modos e nos dois canais, observando estado persistido; aplicar contrato comum para efeitos da decisão.

### A2 — P1 — aprovação de reembolso confirma créditos sem conferir resultado fiscal

[`revisao.ts:128`](../../api/routers/revisao.ts#L128) define crédito `confirmado` ao aprovar e atualiza todos os créditos da despesa em `:154–157`, sem ler a verificação fiscal. A checagem de evidência para confiança média em `:104–116` verifica a existência de uma linha de evidência.

**Impacto:** revisão motivada por nota cancelada, consulta indisponível ou modelo não suportado pode terminar com créditos marcados como confirmados ao aprovar o reembolso. Constatação sobre estados do software, sem conclusão tributária sobre documentos reais.

**Fechamento:** separar aprovação de reembolso da confirmação fiscal; testar estados autorizada, cancelada, indisponível, não suportada e desativada segundo a regra de produto.

### A3 — P1 — novo upload pode gerar despesa duplicada

[`despesas.ts:62`](../../api/routers/despesas.ts#L62) insere nova nota a cada upload. A verificação posterior é por `notaFiscalId`, não pela identidade do documento. [`fiscalSchema.ts:29`](../../db/fiscalSchema.ts#L29) não impõe unicidade por empresa+hash/chave. WhatsApp cobre checksum binário idêntico em [`comprovanteDb.ts:289`](../../api/modules/reembolso/whatsapp/comprovanteDb.ts#L289).

**Impacto:** a mesma nota enviada novamente pelo painel pode receber outro ID e outra despesa; a proteção exata do WhatsApp não resolve todos os canais. O relatório de 14/09 registra três entradas do mesmo cupom, ainda em conciliação; essa ocorrência não foi reconsultada no banco.

**Fechamento:** identidade/reserva por empresa compartilhada entre canais e prova de concorrência, reenvio e mesma chave em arquivo diferente.

### A4 — P2 — link de checkpoints pode perder o scroll no carregamento inicial

[`Dashboard.tsx:316`](../../src/pages/app/Dashboard.tsx#L316) executa `scrollIntoView` em um frame e depende apenas de `location.hash`. Durante loading (`:518–520`), a seção (`:796`) ainda não existe. Quando aparece, o hash não mudou e o efeito pode não repetir. O contador também exibe zero enquanto a query carrega (`:802–804`).

**Impacto:** abrir o link diretamente pode não levar ao bloco esperado; zero temporário pode parecer ausência de registros. Identificado por análise de fluxo; não reproduzido em navegador nesta rodada.

**Fechamento:** verificar navegação direta com respostas atrasadas, clique no menu, loading, erro/retry e troca de empresa no dashboard.

### A5 — P2 — upload/evidência não validam o arquivo no backend web

[`types.ts:76`](../../contracts/types.ts#L76) limita comprimento de strings, mas aceita MIME/base64 inválidos; `evidenciaInput` em `:115–122` permite ausência do conteúdo. [`despesas.ts:54`](../../api/routers/despesas.ts#L54) encaminha ao OCR e `:678–701` persiste evidências. O validador mais estrito do receptor WhatsApp não é aplicado aqui.

**Impacto:** conteúdo inválido pode ser registrado e uma evidência sem arquivo pode satisfazer a contagem exigida na revisão. Com OCR de visão configurado, conteúdo rotulado como imagem/PDF pode chegar a tentativa de chamada externa; custo efetivo depende do provedor. Existe limite global de corpo e limite textual por arquivo: não é upload ilimitado.

**Fechamento:** validar formato/assinatura/tamanho decodificado; definir que suporte documental efetivo é exigido pela revisão e testar rejeição antes do OCR/persistência.

### A6 — P2 — parâmetros e hierarquia não têm efeito integrado comprovado

Benefícios `temValeRefeicao`/`temContratoCorporativoApp` são gravados em [`campo.ts:44`](../../api/routers/campo.ts#L44); as referências de produção localizadas não os consomem no decisor. `superiorDiretoId` é gravado em [`equipeLote.ts:186`](../../api/routers/equipeLote.ts#L186), mas a revisão usa aprovador/analista designados.

**Impacto:** configurar benefícios ou superior não garante mudança de decisão ou encaminhamento. Precedência superior versus aprovador precisa estar definida para implementar o efeito correto.

### A7 — P1 de evidência — validações gerais foram apresentadas como prova específica

[`browser-smoke.mjs:286`](../../tools/poc/browser-smoke.mjs#L286) exercita telas gerais; não verifica o objetivo principal da PR #54. O relatório registra HEAD e hash de `dist/boot.js`, mas não estabelece sozinho origem imutável do build. O manifesto público compartilha esse hash declarado, reforçando correlação documental; não substitui verificação independente do artefato servido.

**Impacto:** decisão de liberação baseada nesses oito checks poderia deixar passar A4. As falas anteriores “8 verificações de checkpoints” e “DNS é o único bloqueio” estavam incorretas. A consulta HTTPS atual também corrige a hipótese de que o commit ainda precisava ser publicado.

**Fechamento:** provar os cenários específicos e ligar fonte, build, execução e manifesto com a mesma evidência.

## Matriz E1–E12

Fonte: `Doze Entregas da PoC - reembolsa.docx`, confrontada pelo agente de aceite com código e documentos locais atuais. **Aceite integral registrado: 0/12**; significa ausência de comprovação integral, não ausência de implementação.

| Entrega | Estado encontrado | Falta para fechar |
| --- | --- | --- |
| E1 — modos | Implementados no WhatsApp/campo; divergência web A1 | Efeito uniforme e promoção/reversão ensaiadas. |
| E2 — fila e aprovador | Isolamento/designados/delegação implementados | Prova do fluxo e perfis em homologação da versão exata; relação com superior. |
| E3 — parâmetros | Tarifa/benefícios/designados persistidos | Benefícios consumidos pelo decisor; comprovar efeito de editar parâmetros. |
| E4 — veículo/combustível | Veículo único e cálculo de plausibilidade existentes | Ponte entre jornada, km comercial, veículo e motor fiscal. |
| E5 — equipe | CSV com prévia, erros e confirmação implementado | Fluxo completo de lote/convites e encaminhamento pelo superior. |
| E6 — métricas/pagamento | Contagens e registro de ato manual existentes | Régua por empresa/período, amostra/precisão e tempo até pagamento. |
| E7 — documento/chave | Identidade persistida em web/WhatsApp | Amostra real rotulada de DANFE/NFC-e com qualidade comparada. |
| E8 — verificação fiscal | Consulta antes da decisão, opcional por empresa, modelo 55 | Prova externa de documento suportado, limite NFC-e 65 e A2. |
| E9 — duplicidade | Deduplicação binária no WhatsApp | A3; semântica/manipulação e medição de falsos positivos. |
| E10 — conversa | Recebimento e confirmação entregue/lida documentados | Decisão com regra/versão na conversa. Mensagem curta foi autorizada; conciliar recorte antes de alterá-la. |
| E11 — campo/Maps | Jornadas, reserva/cálculo Maps e tarifa implementados | Jornada real, evidência Maps e ponte fiscal/comercial. |
| E12 — ensaio final | Roteiro e candidato disponíveis | Resolver P1, ensaiar empresa real/três modos/reversão, registrar aceite. |

## Qualidade documental e próximos passos

## Revalidação após correções desta rodada

No mesmo checkout, A1, A2 e A3 foram corrigidos sem migração destrutiva:

- A1 aplica sombra/assistido/autônomo nas rotas web, com política e versão compatíveis; 20 testes focados passaram.
- A2 separa aprovação de reembolso da confirmação fiscal e preserva créditos vedados ou sem verificação autorizada; 74 testes focados passaram.
- A3 compartilha bloqueio transacional por empresa entre web/WhatsApp, deduplica hash/chave e trava a nota antes da criação concorrente da despesa. Duplicados históricos não foram apagados.
- O efeito de carregamento/âncora de checkpoints foi ajustado para esperar as queries necessárias antes do scroll.
- Suíte final nesta rodada: **881 testes aprovados, 39 ignorados; 103 arquivos aprovados, 4 ignorados**. `npm run check`, `npm run lint`, `npm run build` e `git diff --check` passaram. O build mantém avisos de tamanho do bundle e Browserslist.
- Smoke browser repetido após o commit `f8123c6`: **8 checks, 9 capturas, zero erros, limpeza concluída**, em banco sintético e com seis chamadas externas bloqueadas. Evidência: `docs/poc/evidencias/browser-9aa8a283-c635-48a2-8feb-9b527f23172e/report.json`. Os checks continuam gerais; não substituem um cenário dedicado de âncora/checkpoints.
- O manifesto HTTPS ainda serve o candidato anterior `1.14.0-rc.20260915t000927z`, baseado em `7f11af7`, e declara `sourceIncludesUncommittedChanges:true`. As correções `f8123c6` ainda não estão publicadas em homologação.

Ainda não há prova SQL real dos novos locks, teste browser específico de checkpoints, ensaio E1–E12 com empresa real ou aceite humano. Esses limites continuam bloqueando a declaração de POC concluída.

`docs/poc/README.md:27–39` conserva estados de 13/09 sob o título “Estado verificado no repositório”. `INTEGRACOES-HOMOLOG-2026-09-14.md` e as matrizes antigas também contêm estados superados pelo balanço posterior. E5 já importa CSV; E8 já consulta antes da decisão; WhatsApp já possui evidência documental de recebimento/entrega. Preservar esses registros como históricos e apontar o estado atual.

Ordem recomendada: **A1 → A2 → A3**, com regressões que verifiquem os estados gravados; depois A4/A5 e consumo dos parâmetros. Critérios E10 e hierarquia exigem conciliar o comportamento autorizado com o escopo. Um ensaio integrado em homologação deve encerrar a rodada funcional, vinculando política, pessoa, documento, decisão, jornada, cálculo e pagamento manual.

## Limites desta auditoria

Abrange revisão transversal de código, segurança, contratos, interface, governança/CI, publicação e doze entregas. Não é revisão linha a linha de todo o repositório nem teste de intrusão. Não foram executados nesta rodada testes SQL reais, login funcional HTTPS, chamadas pagas, testes com documentos/pessoas reais, restauração de backup ou aceite E1–E12. Produção não foi inspecionada ao vivo. CI autenticado e análise atual de vulnerabilidades de dependências permanecem sem verificação. Testes verdes não eliminam os achados acima.

Foram criados somente documentos de auditoria; nenhuma correção da aplicação, migração, envio de mensagem ou deploy foi realizado nesta rodada.

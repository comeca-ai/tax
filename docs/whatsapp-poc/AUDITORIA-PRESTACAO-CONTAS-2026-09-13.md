# Auditoria e prestação de contas — processo 360dialog

**Data da auditoria:** 13/09/2026 (UTC)  
**Repositório:** `comeca-ai/projeto_tribureembolsa` (privado)  
**Equipe observável:** 1 conta de colaborador com acesso administrativo registrada no GitHub; 1 agente de IA atuando nesta revisão, sem subagentes. A lista de colaboradores não mede quantos desenvolvedores humanos trabalharam nem suas horas. A revisão independente continua sendo requisito de processo para mudanças sensíveis, mesmo que a proteção estivesse com 0 aprovações obrigatórias na inspeção.

## Combinados e situação

| Combinado | Evidência | Situação |
|---|---|---|
| Usar somente 360dialog como transporte WhatsApp da POC | D-022, `docs/DECISOES.md` e POC-06 | Mantido |
| Não expor tokens, secrets ou respostas do provedor | Workflows e artefatos sanitizados | Houve tokens colados anteriormente no chat; a revogação deles não foi comprovada nesta auditoria |
| Não alterar produção nem enviar mensagens durante a homologação | Workflow somente leitura com dois GETs; `providerMutation=false`, `messageSent=false` | Mantido |
| Executar credenciais somente manualmente, na `main`, em `homologacao` | `.github/workflows/*whatsapp*.yml`, environment e gates | Mantido |
| Proteger a `main` e fixar Actions por SHA | Proteção da branch e `tools/github/workflows-security.check.mjs` | Mantido |
| Registrar o plano e as decisões no GitHub | `docs/poc/`, changelog e este relatório | Plano anterior publicado; relatório e correção publicados na branch `fix/360dialog-documentacao-diagnostico`, ainda sujeitos à integração por PR |

## O que foi executado

- Revisão da documentação oficial 360dialog. Os endpoints usados pelo código estão corretos: `GET /health_status`, `GET /v1/configs/webhook` e `POST /messages`, no host `https://waba-v2.360dialog.io`, com o header `D360-API-KEY`.
- [PR #36](https://github.com/comeca-ai/projeto_tribureembolsa/pull/36) (documentação do canal único), mesclado às 11:18:31 UTC.
- [PR #37](https://github.com/comeca-ai/projeto_tribureembolsa/pull/37) (endurecimento de GitHub Actions e governança), mesclado às 12:44:28 UTC, commit `e24b4b6`.
- Validações locais aprovadas: lint, tipos, testes (39 arquivos / 462 testes) e build. Permanecem apenas avisos não bloqueantes de Browserslist e tamanho de bundle.
- Proteções verificadas no GitHub: repositório privado; `main` com status obrigatório `Lint, tipos, testes e build`, histórico linear, conversas resolvidas, administradores incluídos, sem force-push e sem deleção; Actions permitidas somente por seleção e SHA obrigatório.
- [Workflow somente leitura #3](https://github.com/comeca-ai/projeto_tribureembolsa/actions/runs/34758554952): sucesso, com intervalo de 33 s entre criação e última atualização; a API key então cadastrada foi aceita e o webhook respondeu 2xx. O diagnóstico sanitizado indicou destino não reconhecido como homologação e `Authorization` diferente do secret de referência do Actions.
- [Workflow #4](https://github.com/comeca-ai/projeto_tribureembolsa/actions/runs/34758943080): falhou, com intervalo de 3 min 20 s entre criação e última atualização, incluindo a reexecução. Não é medição de duração de um único job. A causa exata não foi comprovada pelos metadados; o script anterior podia falhar antes da rede se faltasse `DIALOG_360_WEBHOOK_SECRET`. O workflow não contém mutações no provedor nem envio de mensagens.

## Tempo contabilizado

A amostra de registros coletada no GitHub cobre 09:10:16–13:10:32 UTC (4 h 00 min 16 s), incluindo PRs, CI, publicação do plano e verificações somente leitura. Esse é um intervalo de calendário entre registros, não duração de trabalho ativo nem horas humanas. A redação deste relatório e os ajustes posteriores não estão incluídos nesse intervalo. Não há apontamento de horas ou valores financeiros disponível para calcular custo ou horas por desenvolvedor.

## Credenciais e pendências

Na inspeção inicial, a API do GitHub listou os secrets de repositório `DIALOG_360_API_KEY` e `URL_API_MENSAGENS`. Posteriormente, o usuário confirmou que cadastrou somente a chave e a URL e que gerou uma nova chave. **A consulta mais recente nesta revisão encontrou `API_KEY` e `URL_API_MENSAGENS`.** A listagem de secrets do environment `homologacao` retornou HTTP 403; não foi possível confirmar seu estado atual. Os valores desses secrets não foram recuperados do GitHub.

`DIALOG_360_WEBHOOK_SECRET` foi definido pelo receptor do projeto e não é uma credencial emitida pela 360dialog. A documentação anterior misturava esse requisito próprio com o cadastro dos campos fornecidos pelo provedor. O header customizado é permitido pela API do provedor; sua exigência decorre do receptor atual, que responde 403 sem o segredo. A ausência desse segredo não impede consultar a API com `D360-API-KEY`.

## Correção após esclarecimento do usuário

- Inventário corrigido para chave e URL da API, sem afirmar que o provedor emite um segredo adicional.
- Workflows aceitam o nome atual `API_KEY` como alternativa ao legado `DIALOG_360_API_KEY`, mantendo a variável interna da aplicação. Não é necessário gerar uma nova chave para corrigir o nome.
- URLs da WABA e do canal preservadas conforme informadas em [Configuração de homologação](CONFIGURACAO-HOMOLOG.md).
- Diagnóstico ajustado para consultar com apenas a API key. A comparação de `Authorization` passa a `null` (não verificada) quando falta segredo de referência.
- URL exata `https://oreembolsobot.app/api/webhooks/360dialog` reconhecida como `canal_informado`, sem inferir homologação ou produção pelo nome.
- O receptor e suas regras de autenticação continuam inalterados; o êxito da consulta da API não certifica a integração completa.

Fonte: [referência oficial da API de webhooks 360dialog](https://docs.360dialog.com/docs/messaging-api/api-reference/webhooks.md), consultada em 13/09/2026.

### Validação da correção nesta revisão

- `npm run lint`, `npm run check`, `npm test` e `npm run build` aprovados; a suíte da aplicação mantém 39 arquivos / 462 testes.
- 14 testes do diagnóstico aprovados, incluindo ausência de segredo de referência e reconhecimento da URL informada.
- 7 testes de workflows aprovados, incluindo execução dos scripts de presença com `API_KEY`, compatibilidade com o nome legado, rejeição de URL sem chave e preservação de `null` no artifact.
- 35 testes sintéticos de configuração de homologação aprovados. Os testes com subprocessos exigiram execução fora do sandbox; não usaram credenciais reais nem fizeram chamadas ao provedor.
- YAML dos três workflows alterados e `git diff --check` validados.
- Mantidos os avisos existentes de Browserslist desatualizado e bundle grande.

A auditoria não executou `POST` de configuração no provedor, não enviou mensagem, não fez deploy SSH e não reiniciou serviços. Essas ações permanecem pendentes de autorização operacional explícita e de confirmação de que o número é de homologação.

## Conclusão

As proteções do repositório e o CI anterior foram verificados. A integração externa 360dialog permanece **parcialmente validada**: a chave anterior funcionou em uma consulta; a chave recém-gerada e o recebimento real ainda precisam de verificação. Próximas etapas: integrar a correção por PR com CI e revisão, executar o diagnóstico com a chave atual, concluir a configuração de autenticação do receptor e validar recebimento durável no canal autorizado. A validação local desta alteração está registrada separadamente dos testes históricos acima.

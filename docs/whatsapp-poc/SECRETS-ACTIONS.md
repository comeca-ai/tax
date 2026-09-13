# Secrets WhatsApp no GitHub Actions

## Estado confirmado pelo usuário — 13/09/2026

O usuário confirmou que cadastrou **somente a chave e a URL da API de mensagens**
no GitHub, a partir da tela de geração da chave 360dialog. Na consulta mais
recente aos nomes dos secrets do repositório, os nomes encontrados foram
**`API_KEY` e `URL_API_MENSAGENS`**. A menção anterior a `DIALOG_360_API_KEY`
como nome atual foi corrigida; esse é o nome interno esperado pela aplicação.
Ele informou ter gerado uma nova chave; a aceitação da chave anterior não
comprova a validade da nova. `DIALOG_360_WEBHOOK_SECRET` não faz parte dos
campos fornecidos nessa tela e não está confirmado como cadastrado.
Não registrar os valores neste documento, em commits, logs ou chat.

| Nome no projeto | Significado | Uso atual |
|---|---|---|
| `API_KEY` | Chave de API gerada para o canal na 360dialog; nome atual no GitHub | Os workflows a mapeiam para `DIALOG_360_API_KEY`, usado internamente no header `D360-API-KEY` |
| `DIALOG_360_API_KEY` | Nome interno da variável e nome de secret legado aceito | Tem precedência quando ambos os nomes estão cadastrados |
| `URL_API_MENSAGENS` | Endereço da API de mensagens exibido pela 360dialog | Cadastrado pelo usuário como secret; o código atual não usa esse valor para escolher endpoints |
| `DIALOG_360_WEBHOOK_SECRET` | Segredo definido pela aplicação para autenticar eventos recebidos | O receptor atual exige correspondência literal com `Authorization`; não é uma segunda chave emitida pela 360dialog |

A [API oficial de webhooks](https://docs.360dialog.com/docs/messaging-api/api-reference/webhooks.md)
exige `D360-API-KEY` nas consultas e permite `headers` customizados na
configuração do webhook. A autenticação da API e a proteção do receptor são
configurações diferentes. A ausência de um campo `Authorization` no painel,
relatada pelo usuário, não significa que faltou copiar uma credencial gerada.

A URL da API de mensagens também não é a URL do webhook. Os destinos do canal
e da WABA informados pelo usuário estão em
[Configuração de homologação](CONFIGURACAO-HOMOLOG.md#urls-informadas-pelo-usuário--13092026).
O envio atual usa `https://waba-v2.360dialog.io/messages`; o valor exato salvo
em `URL_API_MENSAGENS` não foi recuperado do GitHub nem validado.
Não é necessário gerar outra chave nem renomear o secret `API_KEY` para usar
os workflows corrigidos. Salvar no GitHub não atualiza por si só a variável
`DIALOG_360_API_KEY` do processo no servidor. A listagem de secrets do environment
`homologacao` retornou HTTP 403 nesta consulta; seu conteúdo atual não foi verificado.

## Evidência histórica de presença

O arquivo `docs/whatsapp-poc/secrets-actions-status.json` registra a checagem
pontual feita na branch documental. Ele é evidência histórica, não é atualizado
automaticamente e não comprova que as credenciais continuam válidas.
O registro histórico não substitui o estado atual informado acima.

O workflow [verificar-secrets-whatsapp.yml](../../.github/workflows/verificar-secrets-whatsapp.yml)
agora executa somente por disparo manual a partir da `main`, com confirmação
explícita e no environment `homologacao`. O resultado fica no resumo imutável
da execução; o workflow não escreve commits no repositório.
Ele informa a presença dos nomes separadamente e exige somente a API key
para concluir essa checagem. A presença da URL ou do segredo do receptor não
é confundida com a validade da chave nem com o aceite da integração.

Nenhum valor, trecho, tamanho ou hash das credenciais é exportado. O workflow
não consulta a 360dialog, não envia mensagens, não configura webhooks, não
transfere secrets para a VPS e não reinicia serviços. Estar presente não
comprova validade da chave nem correspondência do segredo com o provedor.

O diagnóstico `verificar-360dialog-readonly.yml` consulta a API usando somente
a API key como requisito de credencial. Quando não há segredo de referência,
registra `webhookSecretConfigured=false` e `authorizationMatchesSecret=null`
(não verificado). O sucesso da consulta não certifica recebimento de eventos.

## Próxima etapa, separada

Foi preparado um [fluxo manual de configuração de homologação](CONFIGURACAO-HOMOLOG.md),
com acesso de deploy restrito, backup e reversão. Está pendente de revisão,
bootstrap de infraestrutura, configuração do environment e confirmação do canal.
O fluxo de instalação e o receptor continuam exigindo o segredo próprio da
aplicação; a consulta somente leitura não remove essa proteção. A definição e
aplicação desse segredo são trabalho de integração, não um campo ausente na
tela de geração da chave da 360dialog.
Não redirecionar o número/webhook de produção para homologação sem decisão
explícita. A preparação não aplicou secrets ao servidor nem reiniciou serviços.

Depois de aplicar a configuração e conferir o canal de teste, validar entrada
real e persistência. Receber um evento não conclui o fluxo de comprovante,
identificação e resposta previsto na POC.

# Integrações da homologação — diagnóstico de 14/09/2026

Verificação inicial às 01:37 UTC, complementada às 01:40 UTC. O usuário autorizou publicação e teste em homologação. Este documento registra a configuração observada antes do deploy em andamento; não declara aceite ponta a ponta. A inspeção consultou presença de valores no runtime, metadados do GitHub e um GET de configuração 360dialog. Nenhum segredo foi exibido e nenhuma mensagem foi enviada.

## Configuração constatada

| Integração | Runtime `/etc/reembolsa/homolog.env` | Secret de repositório encontrado | Ação concreta |
| --- | --- | --- | --- |
| 360dialog | `DIALOG_360_API_KEY` presente, mas GET de configuração respondeu 401; `DIALOG_360_WEBHOOK_SECRET` ausente | `API_KEY` | Transferir a chave cadastrada no GitHub por canal restrito e verificar sua validade; configurar autenticação do receptor e conferir o mesmo cabeçalho no webhook do provedor. |
| Google Routes | `GOOGLE_MAPS_API_KEY` e `POC_MAPS_ENABLED` ausentes | `API_GOOGLE_MAPS` | Mapear `secrets.API_GOOGLE_MAPS` para `GOOGLE_MAPS_API_KEY` no provisionamento e habilitar `POC_MAPS_ENABLED=true` somente no runtime homologado. |
| Consulta NFE.io | `API_NFE_IO` e `NFE_IO_ENABLED` ausentes | `API_NFE_IO` | Provisionar a credencial; definir `NFE_IO_ENABLED=true`, `NFE_IO_BUDGET_ID` e orçamento persistido antes de uma consulta fiscal autorizada. |
| OCR e política OpenAI | `OPENAI_API_KEY` presente | `OPEN_AI_KEY` | Preservar a configuração instalada. Em novo provisionamento, mapear explicitamente o nome cadastrado para o nome de runtime. |
| OCR Mistral | `MISTRAL_API_KEY` presente | Não consta na listagem de secrets de repositório | Preservar a configuração instalada; presença não comprova validade ou saldo. |
| SMTP | `SMTP_HOST` e `SMTP_PASS` presentes | Não consta na listagem de secrets de repositório | Preservar a configuração instalada; entrega de e-mail ainda exige evidência funcional. |
| API de serviço por empresa | `WHATSAPP_SERVICE_TENANT_TOKENS` ausente | Não consta na listagem de secrets de repositório | Gerar token exclusivo de homologação vinculado à empresa de teste e provisionar o consumidor que utilizar `/api/v1/*`. |

A listagem do repositório também contém `URL_API_MENSAGENS`. O valor não foi lido, portanto não é prova do destino configurado no provedor. O `.env` do checkout `/root/tax` não contém as credenciais acima e não serve como fonte para recuperá-las.

## Divergência que impede Maps

O workflow `.github/workflows/verificar-secrets-maps.yml` referencia `secrets.GOOGLE_MAPS_API_KEY`, mas a chave existente no repositório chama-se `API_GOOGLE_MAPS`. O nome da variável de runtime deve continuar `GOOGLE_MAPS_API_KEY`; o vínculo com a origem precisa ser corrigido para o nome efetivamente cadastrado. A existência do secret no GitHub não instala seu valor no servidor.

## Acesso GitHub e transferência

`GET /repos/comeca-ai/projeto_tribureembolsa/actions/secrets` respondeu com os cinco nomes descritos acima. As consultas a `/environments/homologacao/secrets` e `/environments/homologacao/variables` responderam HTTP 403 ao token disponível. Por isso, nenhuma conclusão de ausência foi feita sobre secrets ou variáveis específicos desse ambiente.

O GitHub não devolve os valores de secrets por GET. O caminho para instalar Maps e NFE.io é executar um workflow que leia os nomes já cadastrados e envie as configurações por canal restrito ao receptor de homologação, depois de o próprio mecanismo de transferência estar revisado e disponível. O receiver existente em `tools/deploy/whatsapp-homolog-receiver.mjs` aceita somente os dois campos 360dialog; ele precisa de uma extensão revisada ou de um mecanismo separado para Maps e NFE.io. Não basta acionar o workflow WhatsApp atual.

No repositório, não constam `HOMOLOG_SSH_PRIVATE_KEY`, `HOMOLOG_SSH_KNOWN_HOSTS` ou `DIALOG_360_WEBHOOK_SECRET`, exigidos pelo workflow de configuração. A listagem de variáveis de repositório está vazia. A falta de acesso ao ambiente impede confirmar se estão cadastrados exclusivamente ali. O menor caminho de provisionamento verificável é instalar o receptor com comando SSH restrito, cadastrar a identidade e os parâmetros de homologação no escopo acessível e publicar o workflow revisado que transfere os secrets pelo stdin do SSH. Exportação de segredo em artifact ou log não é um mecanismo aceitável de transferência.

Na consulta ao GitHub, `main` está protegida no commit `5f3484e9ca7c4a5bf0e16141c26822e1ffa386e1` e não há PR aberta. Os workflows `configurar-whatsapp-homolog.yml` e `verificar-360dialog-readonly.yml` estão ativos; `verificar-secrets-maps.yml` ainda não aparece entre os workflows publicados. Nenhuma alteração foi feita no GitHub nesta inspeção.

## Sequência para concluir a configuração

1. Concluir o isolamento de usuário Linux, banco, uploads e unidade da homologação; instalar o artefato identificado e suas migrações.
2. Configurar o cabeçalho de autenticação 360dialog no receptor e no provedor, apontando para a URL HTTPS de homologação verificada. Conferir recebimento autenticado e persistência; HTTP 200 isolado não prova processamento.
3. Habilitar e supervisionar o worker após as credenciais e tabelas estarem prontas. Registrar processamento e deduplicação de um evento autorizado.
4. Corrigir a origem do secret Maps e transferir Maps/NFE.io por canal restrito, sem imprimir valores em logs ou argumentos de processo.
5. Provisionar o token de serviço ligado à empresa de homologação se o teste incluir os endpoints `/api/v1/*`; esse token não substitui o segredo de autenticação do webhook.
6. Executar e registrar as jornadas reais previstas no aceite. Maps exige checkout e resposta válida de Routes; NFE.io exige orçamento e chave fiscal compatível. A implementação atual de consulta fiscal administrativa não equivale a consulta automática no recebimento.

## Orçamento e limites desta evidência

O ledger `/root/.config/codex-secrets/poc-consultas-2026-09-13.jsonl` tinha seis reservas no instante da inspeção inicial: três para OpenAI e três para 360dialog. A consulta 7 reservou um GET `https://waba-v2.360dialog.io/v1/configs/webhook`, sem redirects, com a chave instalada em homologação. A resposta foi **HTTP 401**; o destino e a presença do cabeçalho não puderam ser determinados. Não houve mudança no provedor. Sob o limite previamente estabelecido de vinte consultas, restam treze reservas. Qualquer inspeção posterior deve atualizar o ledger e a evidência correspondente.

Permanecem sem comprovação neste documento: destino e cabeçalho atuais do provedor, entrega real SMTP, validade de Maps/NFE.io, processamento do worker e aceite do usuário. O relatório de deploy deve registrar separadamente o que foi alterado depois desta fotografia.

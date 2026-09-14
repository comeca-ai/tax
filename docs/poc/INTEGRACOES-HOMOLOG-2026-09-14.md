# Integrações da homologação — diagnóstico de 14/09/2026

Atualização às 02:03 UTC. A transferência das três credenciais para homologação foi concluída e a nova chave 360dialog foi aceita. **O canal ainda aponta para `https://oreembolsobot.app/api/webhooks/360dialog`, e seu Authorization não coincide com o segredo da homologação.** Nenhum segredo foi exibido, nenhuma mensagem foi enviada e o destino do provedor não foi alterado nesta inspeção. Isso ainda não representa aceite ponta a ponta.

## Provisionamento concluído e validação atual

A [PR #43](https://github.com/comeca-ai/projeto_tribureembolsa/pull/43) foi mergeada às 01:52:45 UTC no commit `ad01150543b314aeb652f8ba7fddc6bc05691f5b`. O [workflow de provisionamento 34797596830](https://github.com/comeca-ai/projeto_tribureembolsa/actions/runs/34797596830), executado nesse commit, terminou com `completed/success` às 01:58:07 UTC. Merge, SHA e conclusão foram confirmados pela API GitHub. O job inclui testes do protocolo com credenciais sintéticas antes da transferência; essa conclusão é evidência do workflow de provisionamento, não de aceite funcional de todos os módulos.

O receptor aplicou `DIALOG_360_API_KEY`, `GOOGLE_MAPS_API_KEY` e `API_NFE_IO` a partir dos nomes já cadastrados no GitHub; gerou o segredo do webhook no servidor e passou pelos checks locais de health/autenticação. O worker permaneceu desativado. A configuração de Maps foi habilitada; consulta fiscal segue dependendo de ativação e orçamento próprios. As credenciais não foram exportadas em artifacts ou logs.

| Verificação 360dialog após provisionamento | Resultado |
| --- | --- |
| Consulta 8 — `GET /health_status` | HTTP 200 |
| Consulta 9 — `GET /v1/configs/webhook` | HTTP 200 |
| URL observada, sem query | `https://oreembolsobot.app/api/webhooks/360dialog` |
| Comparação exata com `https://homolog.oreembolsobot.app/api/webhooks/360dialog` | Falso |
| Cabeçalho Authorization configurado no provedor | Sim |
| Authorization coincide com `DIALOG_360_WEBHOOK_SECRET` instalado na homologação | Não |
| Alteração de provedor ou mensagem enviada nesta verificação | Nenhuma |

A URL observada usa o domínio público sem prefixo de homologação. Apontar esse canal à homologação substituiria o destino atualmente configurado. O GET, sozinho, não informa se o canal atende usuários de produção; essa condição precisa ser resolvida na decisão operacional antes da troca. A chave agora é aceita; o bloqueio atual é o destino/autenticação do webhook e a ativação controlada do worker, seguidos do teste real.

## Histórico: configuração constatada antes do provisionamento

Fotografia das 01:37–01:40 UTC, preservada para rastrear os bloqueios encontrados e resolvidos. As ausências e o erro 401 na tabela abaixo descrevem o estado anterior; a seção acima contém a situação atual.

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

## Histórico: divergência de nome no diagnóstico Maps

O workflow `.github/workflows/verificar-secrets-maps.yml` referencia `secrets.GOOGLE_MAPS_API_KEY`, mas a chave existente no repositório chama-se `API_GOOGLE_MAPS`. O novo workflow de provisionamento resolveu a transferência ao mapear `API_GOOGLE_MAPS` para `GOOGLE_MAPS_API_KEY` no runtime. O diagnóstico antigo deve receber a mesma correção de origem quando publicado.

## Histórico: acesso GitHub e transferência antes da implementação

`GET /repos/comeca-ai/projeto_tribureembolsa/actions/secrets` respondeu com os cinco nomes descritos acima. As consultas a `/environments/homologacao/secrets` e `/environments/homologacao/variables` responderam HTTP 403 ao token disponível. Por isso, nenhuma conclusão de ausência foi feita sobre secrets ou variáveis específicos desse ambiente.

O GitHub não devolve os valores de secrets por GET. O caminho para instalar Maps e NFE.io é executar um workflow que leia os nomes já cadastrados e envie as configurações por canal restrito ao receptor de homologação, depois de o próprio mecanismo de transferência estar revisado e disponível. O receiver existente em `tools/deploy/whatsapp-homolog-receiver.mjs` aceita somente os dois campos 360dialog; ele precisa de uma extensão revisada ou de um mecanismo separado para Maps e NFE.io. Não basta acionar o workflow WhatsApp atual.

No repositório, não constam `HOMOLOG_SSH_PRIVATE_KEY`, `HOMOLOG_SSH_KNOWN_HOSTS` ou `DIALOG_360_WEBHOOK_SECRET`, exigidos pelo workflow de configuração. A listagem de variáveis de repositório está vazia. A falta de acesso ao ambiente impede confirmar se estão cadastrados exclusivamente ali. O menor caminho de provisionamento verificável é instalar o receptor com comando SSH restrito, cadastrar a identidade e os parâmetros de homologação no escopo acessível e publicar o workflow revisado que transfere os secrets pelo stdin do SSH. Exportação de segredo em artifact ou log não é um mecanismo aceitável de transferência.

Na consulta ao GitHub, `main` está protegida no commit `5f3484e9ca7c4a5bf0e16141c26822e1ffa386e1` e não há PR aberta. Os workflows `configurar-whatsapp-homolog.yml` e `verificar-360dialog-readonly.yml` estão ativos; `verificar-secrets-maps.yml` ainda não aparece entre os workflows publicados. Nenhuma alteração foi feita no GitHub nesta inspeção.

## Sequência restante para concluir a configuração

1. Resolver a destinação do canal que hoje aponta ao domínio público; aplicar a URL de homologação e o mesmo Authorization do receptor somente dentro da decisão operacional autorizada. Conferir recebimento autenticado e persistência; HTTP 200 isolado não prova processamento.
2. Habilitar e supervisionar o worker após a configuração do provedor. Registrar processamento e deduplicação de um evento autorizado.
3. Provisionar o token de serviço ligado à empresa de homologação se o teste incluir os endpoints `/api/v1/*`; esse token não substitui o segredo de autenticação do webhook.
4. Executar e registrar as jornadas reais previstas no aceite. Maps exige checkout e resposta válida de Routes; NFE.io exige orçamento e chave fiscal compatível. A implementação atual de consulta fiscal administrativa não equivale a consulta automática no recebimento.

## Orçamento e limites desta evidência

O ledger `/root/.config/codex-secrets/poc-consultas-2026-09-13.jsonl` tinha seis reservas no instante da inspeção inicial: três para OpenAI e três para 360dialog. A consulta 7 ao webhook com a credencial antiga respondeu **HTTP 401**. Após provisionamento, as consultas 8 e 9 verificaram health e configuração com a nova chave, ambas HTTP 200. Todos os GETs recusaram redirects; nenhuma operação alterou o provedor. Sob o limite previamente estabelecido de vinte consultas, restam **onze reservas**. Qualquer inspeção posterior deve atualizar o ledger e a evidência correspondente.

Permanecem sem comprovação neste documento: entrega real SMTP, validade de Maps/NFE.io, processamento do worker e aceite do usuário. Destino atual e divergência de cabeçalho do provedor foram verificados conforme a tabela inicial. O relatório de deploy deve registrar separadamente qualquer alteração posterior.

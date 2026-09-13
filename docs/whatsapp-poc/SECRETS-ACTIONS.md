# Secrets WhatsApp no GitHub Actions

Em 13/09/2026, o usuário informou ter cadastrado os secrets
`DIALOG_360_API_KEY` e `DIALOG_360_WEBHOOK_SECRET` no repositório.
Não registrar os valores neste documento, em commits, logs ou chat.

## Evidência histórica de presença

O arquivo `docs/whatsapp-poc/secrets-actions-status.json` registra a checagem
pontual feita na branch documental. Ele é evidência histórica, não é atualizado
automaticamente e não comprova que as credenciais continuam válidas.

O workflow [verificar-secrets-whatsapp.yml](../../.github/workflows/verificar-secrets-whatsapp.yml)
agora executa somente por disparo manual a partir da `main`, com confirmação
explícita e no environment `homologacao`. O resultado fica no resumo imutável
da execução; o workflow não escreve commits no repositório.

Nenhum valor, trecho, tamanho ou hash das credenciais é exportado. O workflow
não consulta a 360dialog, não envia mensagens, não configura webhooks, não
transfere secrets para a VPS e não reinicia serviços. Estar presente não
comprova validade da chave nem correspondência do segredo com o provedor.

## Próxima etapa, separada

Foi preparado um [fluxo manual de configuração de homologação](CONFIGURACAO-HOMOLOG.md),
com acesso de deploy restrito, backup e reversão. Está pendente de revisão,
bootstrap de infraestrutura, configuração do environment e confirmação do canal.
Não redirecionar o número/webhook de produção para homologação sem decisão
explícita. A preparação não aplicou secrets ao servidor nem reiniciou serviços.

Depois de aplicar a configuração e conferir o canal de teste, validar entrada
real e persistência. Receber um evento não conclui o fluxo de comprovante,
identificação e resposta previsto na POC.

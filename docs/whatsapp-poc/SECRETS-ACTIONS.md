# Secrets WhatsApp no GitHub Actions

Em 13/09/2026, o usuário informou ter cadastrado os secrets
`DIALOG_360_API_KEY` e `DIALOG_360_WEBHOOK_SECRET` no repositório.
Não registrar os valores neste documento, em commits, logs ou chat.

## Verificação de presença

O workflow [verificar-secrets-whatsapp.yml](../../.github/workflows/verificar-secrets-whatsapp.yml)
executa somente na branch `docs/360dialog-canal-unico`. Um job sem permissões
de escrita verifica os dois valores e produz apenas booleanos. Outro job,
sem receber credenciais da 360dialog, grava o resultado em
`docs/whatsapp-poc/secrets-actions-status.json` nessa mesma branch.

Nenhum valor, trecho, tamanho ou hash das credenciais é exportado. O workflow
não consulta a 360dialog, não envia mensagens, não configura webhooks, não
transfere secrets para a VPS e não reinicia serviços. Estar presente não
comprova validade da chave nem correspondência do segredo com o provedor.

## Próxima etapa, separada

Preparar a aplicação segura dos secrets à homologação por um fluxo de
configuração autorizado, com acesso de deploy restrito e separação de ambientes.
Não redirecionar o número/webhook de produção para homologação sem decisão
explícita. O repositório ainda não contém esse fluxo de aplicação no servidor.

Depois de aplicar a configuração e conferir o canal de teste, validar entrada
real e persistência. Receber um evento não conclui o fluxo de comprovante,
identificação e resposta previsto na POC.

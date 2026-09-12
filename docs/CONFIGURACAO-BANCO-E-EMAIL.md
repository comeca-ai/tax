# Configuração de banco e e-mail em produção

Este projeto usa MariaDB/MySQL e o envio transacional do Cloudflare Email
Sending. Segredos ficam exclusivamente no arquivo de ambiente protegido do
servidor; nunca são adicionados ao Git.

## Banco de dados

- Banco: `reembolsa` em MariaDB local, acessível somente em `127.0.0.1:3306`.
- Usuário da aplicação: possui apenas os privilégios necessários no banco da
  aplicação; não é usuário administrador do servidor.
- Schema: as migrations em `db/migrations/` são a fonte de verdade. Em uma
  instalação nova, aplique-as em ordem. Não use `db:push` em produção.
- Backup: agendar `mariadb-dump --single-transaction reembolsa` diariamente,
  guardar o arquivo fora do servidor e testar uma restauração periodicamente.

Antes de publicar uma versão que tenha migration, valide a sequência inteira em
uma base vazia. As migrations deste repositório são compatíveis com MariaDB e
usam `BIGINT UNSIGNED AUTO_INCREMENT` para as chaves primárias.

## E-mail transacional da Cloudflare

No painel Cloudflare, abra **Compute > Email Service > Email Sending** e faça
o onboarding de `oreembolsobot.app`. A Cloudflare cria os registros de SPF,
DKIM, DMARC e bounce necessários; aguarde a validação antes de enviar e-mail.

Para o aplicativo Node atual, use o SMTP oficial da Cloudflare:

```ini
SMTP_HOST=smtp.mx.cloudflare.net
SMTP_PORT=465
SMTP_USER=api_token
SMTP_PASS=<API token Cloudflare com somente Email Sending: Edit>
SMTP_FROM=reembolsa.ia <no-reply@oreembolsobot.app>
```

O token deve ser criado como token de conta, limitado à permissão **Email
Sending: Edit**, e gravado somente no arquivo de ambiente do serviço. Após
atualizá-lo, reinicie o serviço e faça um teste real de convite e redefinição de
senha.

O binding `env.EMAIL.send()` exibido na Cloudflare é uma alternativa para
aplicações que rodam dentro de um Worker. Como este backend roda em Node no
servidor, SMTP evita criar e proteger um Worker intermediário.

## Convites por WhatsApp

O WhatsApp do colaborador é opcional. Quando informado em formato
internacional (por exemplo, `55 11 99777-6666`), o botão de convite abre uma
conversa `wa.me` com uma mensagem e o link de aceite prontos. O gestor confere
o destinatário e confirma o envio no WhatsApp. Esse é o fallback quando o
envio automático pela 360dialog não estiver configurado.

## Convite automático com 360dialog

O projeto também pode disparar o convite pelo prestador 360dialog. Configure
`DIALOG_360_API_KEY` e o nome de um template ativo em
`DIALOG_360_INVITE_TEMPLATE`; sem ambas as variáveis, o envio automático fica
desligado e o link `wa.me` manual continua sendo o fallback.

Crie e aguarde a aprovação de um template **UTILITY** com este contrato:

- corpo: `Olá, {{1}}. A {{2}} convidou você para acessar o reembolsa.ia.`;
- botão URL dinâmico (primeiro botão):
  `https://oreembolsobot.app/convite/{{1}}`.

O código preenche, nessa ordem, `{{1}}` do corpo com o nome, `{{2}}` com a
empresa e o `{{1}}` do botão com o token do convite. A 360dialog envia pelo
endpoint `https://waba-v2.360dialog.io/messages`, usando o header
`D360-API-KEY`. Templates são obrigatórios quando o destinatário não tem uma
janela de atendimento de 24 horas aberta.

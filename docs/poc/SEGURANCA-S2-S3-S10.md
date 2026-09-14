# Segurança S2, S3 e S10 — 13/09/2026

## S2 — revogação de sessão

O token de sessão continua assinado por HMAC-SHA256 e contém agora um marcador HMAC opaco, separado por domínio, derivado do identificador do usuário e da senha armazenada. A senha e seu hash não aparecem no cookie. Cada emissão contém nonce aleatório próprio. O contexto consulta a credencial atual no banco e só devolve campos públicos da conta; alteração ou redefinição da senha torna todos os cookies anteriores inválidos.

Logout registra a impressão SHA256 do token na tabela durável `auth_sessoes_revogadas` antes de limpar o cookie. Uma cópia capturada do cookie também perde acesso; outros dispositivos permanecem conectados até logout próprio ou troca de senha. O contexto verifica a denylist em cada requisição autenticada. Falha de banco não anuncia revogação concluída. Entradas expiradas são removidas em lotes limitados no logout.

Reset e troca de senha são transacionais, usam o mesmo lock do usuário e invalidam os links de reset existentes. O reset verifica novamente validade/uso sob lock antes de atualizar a senha, evitando que o mesmo token seja usado duas vezes por requisições concorrentes. A troca de senha limpa o cookie atual e exige novo login.

**Compatibilidade operacional:** todos os cookies do formato anterior são recusados e os usuários precisam autenticar novamente. Aplicar a migração 0019 antes do novo código e atualizar todos os processos; instâncias antigas não implementam a revogação e não devem permanecer atendendo durante um rollout misto. A revogação afeta as próximas requisições, sem cancelar trabalho já autorizado em andamento.

## S3 — limite durável de autenticação

`auth_rate_limits` mantém contador/janela por ação e identidade pseudonimizada com HMAC. O contador é atualizado numa transação InnoDB com lock de linha; processos que compartilham banco e APP_SECRET compartilham o limite. Não é um Map em memória e não depende de cabeçalhos de IP fornecidos pelo cliente.

| Ação | Por identidade | Total da ação | Janela |
| --- | ---: | ---: | --- |
| Login | 10 | 2.000 | 15 minutos |
| Cadastro simples e com empresa, compartilhado | 5 | 500 | 1 hora |
| Solicitar reset | 3 | 1.000 | 15 minutos |
| Usar token de reset | 10 | 2.000 | 15 minutos |
| Trocar senha | 10 | 2.000 | 15 minutos |

Login/cadastro/solicitação usam e-mail normalizado; uso de reset usa o token como entrada do HMAC, sem armazená-lo no contador; troca usa identificador da conta. Os limites são consumidos antes de consultar conta, calcular hash de senha ou enviar mensagem. Tentativas excedentes recebem `TOO_MANY_REQUESTS` com mensagem genérica. Indisponibilidade do armazenamento bloqueia essas ações; `auth.me` e health não consultam o limitador.

Contadores com janela iniciada há mais de 24 horas são removidos em lotes de até 100 nas ações aceitas. O limite é de janela fixa: permite concentração de tentativas perto da virada; não substitui proteção volumétrica no proxy. Um atacante pode esgotar a cota de uma identidade ou, com tráfego suficiente, a cota global da ação. Os plafonds globais são altos para limitar esse impacto; não há alegação de proteção completa contra DDoS. Rotacionar APP_SECRET muda as chaves dos contadores e invalida as sessões.

## S10 — recuperação sem link em logs

Removido o log que imprimia e-mail e URL com token quando SMTP estava indisponível. O catch de envio de reset também omite o erro bruto do transporte, que pode conter destinatário ou conteúdo. O cadastro com empresa não imprime mais erro de banco bruto. A API de solicitação continua com resposta genérica; ausência/falha de SMTP não cria um canal alternativo de entrega do link.

## Migração e validação

- Migração aditiva/reexecutável: `db/migrations/0019_auth_seguranca.sql`; schema em `db/authSchema.ts`, incluído no Drizzle e conexão.
- Reversão SQL separada em `db/migrations/rollback/0019_auth_seguranca.sql`. Executá-la somente depois de parar tráfego e reverter o código; remoção da denylist perde as revogações persistidas.
- Testes unitários: `api/auth/session.revogacao.test.ts`, `api/context.revogacao.test.ts` e `api/routers/auth.seguranca.test.ts` provam invalidação por credencial, assinatura/expiração, nonce independente, rejeição de sessão revogada, ausência de hash no contexto, limites antes de consultas/envio e logs sem tokens.
- Teste real preparado: `db/auth.integracao.test.ts`, habilitado somente por `POC_TEST_DATABASE_URL` em localhost com nome `reembolsa_poc_test_*`; sem DDL ou leitura de URL operacional. Cobre 20 tentativas simultâneas, persistência entre conexões, reabertura da janela, revogação individual e troca da credencial no banco. Na execução sem essa variável os testes SQL são explicitamente pulados, não considerados aprovados.
- O smoke browser usa o novo emissor de sessão com a credencial sintética correspondente à fixture; o banco do smoke também precisa da migração 0019.

Esta frente não executou deploy, não utilizou credenciais reais e não enviou mensagens. O relatório principal deve anexar o resultado SQL após aplicar a migração no banco isolado e os checks finais integrados.

Execução local às 18:25 UTC: **87 testes passaram em 5 arquivos** (sessão existente, sessão/revogação, contexto, rotas de autenticação e regressão de migrações). `npm run check` passou após incluir todos os arquivos desta frente. Os quatro testes SQL ficaram explicitamente pulados na execução sem `POC_TEST_DATABASE_URL`; aguardam execução da integração principal no banco isolado.

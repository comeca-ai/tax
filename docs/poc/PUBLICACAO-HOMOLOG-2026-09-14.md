# Publicação do candidato em homologação — 14/09/2026

URL: https://homolog.oreembolsobot.app

Candidato: **1.14.0-rc.20260914t013756z**. Base `1eab6fee72cbe65985383a3b917e1bed321610a2` com alterações locais identificadas. Backend SHA-256 `200c49fa6e2ea76b0185d132530cf7babd0dbcf35b6e1c2cf8ca546731be5cc6`, confirmado por HTTPS em `/release.json`.

## Autorizações e limites

O usuário autorizou expressamente subir a versão integrada em homologação para teste e pediu agentes para resolver as pendências. O candidato local foi publicado após validação e revisão por outro agente IA; ainda não representa uma versão com CI remoto e revisão humana de todo o código integrado. Essa exceção ao fluxo completo foi limitada ao teste em homologação nesta rodada. Promoção a produção permanece condicionada a PR/CI/revisão, artefato aprovado e aceite. Nenhum prazo novo foi combinado.

## Validação do artefato

- 745 testes passaram, 20 ignorados na suíte geral. Os ignorados permanecem explícitos.
- 23 testes SQL passaram no banco descartável, incluindo E5 e segurança. Há sobreposição com a suíte geral; não somar.
- Tipos, lint e build passaram. Avisos de tamanho do bundle permanecem.
- Revisão de outro agente: 75 testes focais passaram.
- Navegador local: 8 verificações e 9 capturas, zero erros e limpeza da massa sintética. Não comprova envio de CSV pela interface ou provedores externos.
- Autenticação real por HTTPS na homologação: 13 verificações passaram às 01:43:30 UTC, incluindo cadastro de fixture cliente, login, senha incorreta, cookie seguro, logout e rejeição de sessão revogada. Fixture removida; nenhum e-mail/WhatsApp enviado.

## Operação aplicada

Backup do banco e da configuração em `/var/backups/reembolsa-homolog/releases/20260914T013756Z`. Aplicação anterior preservada em `/srv/reembolsa/homolog/previous-20260914T013756Z`. Migrações aditivas aplicáveis de 0013 a 0020 executadas antes do início do novo processo; nenhum seed foi executado. Administrador preexistente confirmado antes de abrir tráfego.

A homologação passou a usar usuário Linux `reembolsa-homolog`, conta de banco `reembolsa_homolog_app` restrita a `reembolsa_homolog` e uploads em diretório próprio. O script de isolamento comprovou negação de acesso ao banco de produção, listener em loopback e PID de produção preservado. Os quatro arquivos de upload anteriores foram copiados e conferidos, preservando os originais.

## Reversão operacional

Em falha do candidato, interromper somente `reembolsa-homolog.service`, preservar o diretório atual, recolocar a aplicação anterior, restaurar a configuração guardada e retirar de serviço o drop-in de isolamento novo (preservando cópia). Recarregar systemd, iniciar apenas homologação e conferir `/api/health` e o processo de produção. O estado original usava usuário compartilhado: essa reversão é contingência, não estado final seguro desejado.

Migrações aditivas podem permanecer durante a reversão da aplicação; não apagar tabelas de revogação ou lotes com o código novo atendendo. Restauração do dump requer manutenção específica para não perder os dados produzidos durante o teste. O retorno automático do script de publicação cobre falha de health antes da etapa posterior de isolamento; a reversão completa após isolamento segue o procedimento acima e ainda não foi ensaiada operacionalmente nesta rodada.

## Integrações e teste do usuário

Login e painel estão disponíveis para teste. A chave 360dialog antiga instalada retornou 401. O PR #43 acrescentou transferência por SSH restrito das credenciais já existentes no GitHub; CI passou e integração na main foi confirmada em `ad01150543b314aeb652f8ba7fddc6bc05691f5b`. A execução de provisionamento é registrada separadamente do deploy do aplicativo.

Maps, consulta fiscal e WhatsApp real precisam das respectivas configurações, limites e validação. Cadastro de chaves não comprova validade, saldo ou entrega de mensagem. Worker desativado durante provisionamento; dados reais da empresa piloto e canal autorizado ainda precisam ser confirmados para o ensaio final.

[Roteiro do usuário](ROTEIRO-HOMOLOG-2026-09-14.md) · [Balanço atualizado](REVISAO-ENTREGAS-2026-09-14.md) · [Critérios das 12 entregas](PROMETIDO-ENTREGUE-2026-09-13.md)

## Resultado da aplicação de chaves

Workflow `34797596830`: **success**, em 14/09/2026. Aplicou chaves existentes, gerou segredo local do receptor e comprovou 403 sem autenticação/com segredo incorreto e 200 com segredo válido no webhook local. Não enviou mensagens nem alterou o webhook no provedor. SSH confirmou host por chave obtida localmente, comando fixo e rejeição de payload inválido.

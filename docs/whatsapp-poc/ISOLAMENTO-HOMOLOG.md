# Isolamento operacional da homologação

Estado deste artefato: **script preparado e coberto por testes sintéticos; não executado no servidor**. Revisar e aplicar somente a partir da versão aprovada pelo processo de PR/main. Não é um workflow de deploy e não altera uma release automaticamente.

## Alvos e efeito

`tools/deploy/isolar-homolog.mjs` atua exclusivamente em `reembolsa-homolog.service`, `/etc/reembolsa/homolog.env`, um drop-in dedicado e a pasta vazia `/srv/reembolsa/homolog/uploads`. Cria usuário/grupo Linux `reembolsa-homolog`, sem login, e conta MariaDB `reembolsa_homolog_app` somente para conexões locais. Concede apenas SELECT, INSERT, UPDATE e DELETE no banco `reembolsa_homolog`; migrações continuam em operação administrativa separada.

Preserva todas as outras variáveis, inclusive as chaves 360dialog e habilitação do worker. Troca exclusivamente DATABASE_URL, APP_HOST e UPLOADS_DIR para a nova credencial gerada em memória, bind `127.0.0.1` e uploads em `/srv/reembolsa/homolog/uploads`. O backend usa `UPLOADS_DIR/politicas`; assim não tenta gravar no checkout que o sandbox tornou somente leitura. Não modifica código, dados de negócio, domínio, webhook, serviço/usuário/banco de produção, nem envia mensagens.

O sandbox systemd torna o sistema de arquivos persistente somente leitura, com exceção da pasta de uploads homolog. O processo também tem `/tmp` privado, sem capabilities e sem privilégios adicionais. Arquivos de configuração/backup ficam root e privados; o systemd lê o arquivo de ambiente como root antes de assumir o usuário do aplicativo.

## Pré-condições verificadas

- Executar como root; caminhos administrativos reais, root-owned e sem escrita por terceiros. Symlinks nesses caminhos são recusados.
- Serviço homolog ativo usando exatamente User/Group `reembolsa`, WorkingDirectory `/srv/reembolsa/homolog/app` e único EnvironmentFile `/etc/reembolsa/homolog.env`. Unidade com outros arquivos, diretórios persistentes automáticos ou mounts exige revisão específica antes de aplicar.
- Produção ativa: PID é capturado e deve continuar idêntico ao final. O script nunca solicita restart da produção.
- Antes de **aplicar**, preparar a release homolog aprovada com suporte APP_HOST e UPLOADS_DIR. O preflight estrutural pode ocorrer antes dessa preparação: não depende de procurar uma string no bundle e não certifica compatibilidade do código. O pós-check recusa listener público, mas o upload funcional de política precisa de teste próprio depois da manutenção. O novo usuário precisa conseguir ler `dist/boot.js`; o script não corrige permissões recursivamente no checkout.
- Contas Linux/grupo e MariaDB dedicadas ainda não existem; drop-in `90-isolation.conf` ausente. É uma migração one-shot, não uma ferramenta de rotação ou reaplicação.
- DATABASE_URL deve ser URL MySQL local, porta 3306, usuário antigo `reembolsa_app` e banco `reembolsa_homolog`, sem query string. Env com sintaxe multilinha/ambígua é recusado, não reinterpretado.
- Pasta uploads ausente ou vazia. Dados preexistentes precisam de migração específica para preservar propriedade e recuperação.
- UPLOADS_DIR anterior deve estar ausente, ser `uploads`, `/srv/reembolsa/homolog/app/uploads` ou o próprio alvo dedicado. Outros caminhos e variáveis duplicadas são recusados. Arquivos históricos do checkout não são movidos nem apagados; validar sua leitura pelo novo usuário separadamente.
- MariaDB administrativo local disponível via socket `/run/mysqld/mysqld.sock`, autenticação root por socket. Nenhuma senha entra em argumento de shell, log ou relatório.

## Revisão e execução

Primeiro execute testes sintéticos no checkout; eles não chamam systemd, MariaDB ou endpoints:

```sh
node --test tools/deploy/isolar-homolog.check.mjs
```

Depois, na sessão administrativa autorizada, preflight sem mudanças:

```sh
sudo node tools/deploy/isolar-homolog.mjs --preflight
```

Somente após revisar o resultado e reservar a breve interrupção da homologação:

```sh
sudo node tools/deploy/isolar-homolog.mjs --apply
```

`--apply` usa trava exclusiva em `/etc/reembolsa/.homolog-isolation.lock`. Trava de execução interrompida exige verificar o PID registrado antes de qualquer remoção manual. Nunca execute duas migrações simultâneas.

O script cria backup root:root 0700 em `/var/backups/reembolsa-homolog/isolation/<UUID>/`: env 0600 e manifesto sem valores das credenciais. Não copie esses arquivos para GitHub. Registre somente resultado sanitizado, identificador do backup, versão/commit aprovado e horário da manutenção.

Pós-checagem exige saúde local, usuário/group novos, listener **127.0.0.1:3101 pertencente ao MainPID**, env 0600, grants sem permissões globais e PID de produção inalterado. Um arquivo temporário de cliente MariaDB, privado no backup, valida login com a nova conta e negação de `USE reembolsa`; é removido ao finalizar. Se ExecStart usa wrapper/npm e MainPID não é dono do listener, a aplicação é recusada e exige revisão da unidade, não relaxamento automático do teste.

## Recuperação e limites

Em falha após backup, o script restaura o env original e seu modo, remove somente o drop-in que criou, restaura metadados de uploads preexistente, faz daemon-reload e reinicia apenas homolog. Confere saúde e identidade anterior. Se essa recuperação falhar, reporta necessidade de intervenção manual.

**DDL de contas/grants não tem rollback transacional aqui.** Usuário/grupo Linux, contas MariaDB e diretório novo de uploads podem permanecer após uma falha. O erro informa essa condição. Não apague automaticamente contas ou dados: identifique o backup, verifique qual usuário a unidade efetivamente usa e confira conteúdo dos uploads antes da limpeza administrativa específica. O script não remove nem revoga a conta compartilhada de produção.

Um reinício bem-sucedido não certifica o fluxo de negócio. Esta operação não valida OCR, provider, pagamento ou migrações da POC; não habilita tráfego. A revogação de credenciais anteriormente expostas e a revisão de arquivos de produção continuam operações distintas. Não há garantia de rollback de DDL ou de ausência absoluta de falhas.

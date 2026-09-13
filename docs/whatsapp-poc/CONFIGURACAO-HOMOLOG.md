# Aplicação dos secrets WhatsApp em homologação

## Estado em 13/09/2026

**Preparado para revisão, ainda não instalado nem executado no servidor.**
Os dois secrets 360dialog já têm presença confirmada no Actions, mas isso não
comprova validade no provedor nem aplicação ao processo de homologação.

Esta mudança prepara configuração, não deploy de código: nenhuma branch é
publicada no servidor, não há migrações, alteração de produção, configuração
do provedor ou envio de mensagens. A versão já instalada permanece a mesma.
O fluxo de releases/RC continua sendo o da
[política de deploy](../POLITICA-DE-RELEASE-E-DEPLOY.md).

Na inspeção, produção e homologação tinham serviços, diretórios e arquivos de
ambiente distintos, mas **o mesmo usuário Linux de execução**. Isso não é
isolamento de segurança entre os processos. Antes da habilitação, operação
deve separar a identidade/permissões da homologação ou registrar uma exceção
aprovada com risco, responsável e prazo; não considerar apenas portas
diferentes como isolamento. Banco, armazenamento e canal também precisam
ser conferidos. Esta preparação não alterou esses acessos.

## Componentes

- [Workflow manual](../../.github/workflows/configurar-whatsapp-homolog.yml):
  somente `main`, ambiente `homologacao`, confirmação explícita, referência
  de aprovação e chave de habilitação administrada pela operação.
- [Emissor](../../tools/deploy/whatsapp-homolog-send.mjs): envia JSON com
  somente duas credenciais e versão do protocolo pelo stdin de SSH; valida
  a chave do servidor previamente cadastrada. Não usa `ssh-keyscan` no deploy.
- [Receptor](../../tools/deploy/whatsapp-homolog-receiver.mjs): instalado e
  revisado por operação, fora do checkout; aceita apenas esse JSON. Não aceita
  comandos, caminhos, serviços ou código enviados pelo Actions.
- [Comando restrito](../../tools/deploy/whatsapp-homolog-command.sh): elimina
  variáveis herdadas e serializa operações com `flock` também no servidor.
- [Testes](../../tools/deploy/whatsapp-homolog.check.mjs): protocolo, entradas
  inválidas, ordem de aplicação, reversão e erros sem dados sensíveis; sem
  rede, secrets reais ou escrita em configuração do servidor.

## Pré-requisitos de GitHub — pendentes

1. Revisão independente de segurança, PR e CI verde; merge aprovado em `main`.
   O workflow não executa no push. O disparo manual depende de o arquivo estar
   na branch padrão. [Documentação do GitHub](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow).
2. Criar/configurar previamente o environment **homologacao**, restrito a
   `main`. Não confiar na criação automática de um ambiente sem proteções.
3. Habilitar aprovação independente e impedir autoaprovação quando o plano
   permitir. Em repositórios privados, recursos de ambientes e revisores
   dependem do plano. Se indisponíveis, manter o fluxo desabilitado até haver
   procedimento de aprovação equivalente registrado; um checkbox não é uma
   aprovação independente. [Limites e proteções](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments).
4. Cadastrar neste ambiente as configurações abaixo. Recomenda-se colocar os
   secrets 360dialog no ambiente também, preservando os mesmos nomes, para que
   estas credenciais pertençam claramente à homologação. Os já cadastrados
   no repositório são um fallback técnico do Actions, não prova dessa separação.

| Nome | Tipo | Conteúdo/finalidade |
|---|---|---|
| `DIALOG_360_API_KEY` | secret | chave do canal autorizado para homologação |
| `DIALOG_360_WEBHOOK_SECRET` | secret | valor literal completo de `Authorization`, distinto da API key |
| `HOMOLOG_SSH_PRIVATE_KEY` | secret | identidade SSH exclusiva para o comando restrito; nunca a chave de produção ou de push ao GitHub |
| `HOMOLOG_SSH_KNOWN_HOSTS` | secret | entrada `known_hosts` obtida por canal confiável e conferida pela operação |
| `HOMOLOG_SSH_HOST` | variable | host alcançável pelo runner; inventário fica na infra privada |
| `HOMOLOG_SSH_PORT` | variable | porta SSH; padrão 22 |
| `WHATSAPP_HOMOLOG_ENABLED` | variable | manter ausente/`false` até concluir os requisitos; somente então `true` |

Não enviar chaves pelo chat. Os valores não aparecem em logs, outputs,
artifacts ou commits. No runner efêmero, apenas a identidade SSH e o arquivo
`known_hosts` usam arquivos temporários privados, removidos ao terminar; as
credenciais 360dialog são transmitidas por stdin, sem arquivo e sem argv.

## Bootstrap de infraestrutura — pendente, com aprovação própria

Operação deve revisar os arquivos do commit aprovado e executar a instalação
administrativa controlada. O workflow não instala seu próprio acesso elevado.

1. Criar a identidade dedicada `whatsapp-homolog-deploy`, sem outros papéis,
   sem senha utilizável e sem acesso aos arquivos da aplicação/produção.
   A identidade SSH precisa de comando forçado e encaminhamentos bloqueados.
   Exemplo de restrições da chave pública (não preencher com segredo):

   ```text
   restrict,command="/usr/bin/sudo -n /usr/local/sbin/reembolsa-whatsapp-homolog" ssh-ed25519 <CHAVE_PUBLICA_DE_DEPLOY>
   ```

   A configuração SSH/autorização deve ser administrada por root e não ser
   alterável pelo usuário dedicado. Manter `PermitUserEnvironment no` e não
   permitir arquivos de inicialização de shell graváveis por essa identidade.
   Ver [restrições do OpenSSH](https://man.openbsd.org/OpenBSD-7.2/sshd.8).
2. Instalar o receptor em `/usr/local/libexec/reembolsa-whatsapp-homolog.mjs`
   e o wrapper em `/usr/local/sbin/reembolsa-whatsapp-homolog`, root:root,
   sem escrita para grupo/outros; wrapper executável. Os diretórios ancestrais
   também não podem ser graváveis pela aplicação ou conta de deploy.
   Node.js 20+, `sudo`, `flock` e `systemctl` precisam existir nos caminhos
   absolutos usados no wrapper. Não apontar para um checkout gravável.
3. Autorizar no sudoers **apenas o wrapper sem argumentos**, sem `SETENV`,
   sem shell, comandos genéricos ou `systemctl *`; validar com `visudo -c`.
   O wrapper também recusa argumentos. Nunca conceder sudo genérico ao runner.
4. Criar `/etc/reembolsa/whatsapp-homolog` root:root `0700` e seu
   `secrets.env` inicialmente vazio, root:root `0600`, **somente se ainda não
   existirem**. Não truncar uma configuração existente. Backups ficam nesse
   diretório protegido, jamais no Git ou em artifacts do Actions.
5. Instalar um drop-in **somente de `reembolsa-homolog.service`**, acrescentando
   como último arquivo de ambiente (sem limpar os anteriores):

   ```ini
   [Service]
   EnvironmentFile=/etc/reembolsa/whatsapp-homolog/secrets.env
   ```

   Após aprovação, recarregar a configuração systemd e confirmar o arquivo na
   lista efetiva do serviço. O arquivo vazio não muda as credenciais existentes.
   Não criar drop-in nem reiniciar o serviço de produção.
6. Verificar que a aplicação de homologação usa os dados e permissões
   aprovados e responde localmente na porta 3101. Confirmar que o build contém
   `/api/webhooks/360dialog`. O receptor recusa serviço com diretório diferente
   do esperado e configuração sem o arquivo dedicado na última posição.
7. Testar a restrição da conta: shell, SFTP/SCP, encaminhamentos e troca de
   destino/comando não podem dar acesso geral. Comando forçado não deve ser
   interpretado como autorização para executar o comando pedido pelo cliente.

O bootstrap é uma mudança de acesso/configuração e deve ter registro de
aprovação e reversão. Nenhuma dessas etapas foi executada nesta preparação.

## Execução autorizada e reversão

Depois dos pré-requisitos, selecionar o workflow na `main`, informar a
referência da aprovação e confirmar canal/janela de homologação. A execução:

1. Verifica as condições e os testes, antes de disponibilizar secrets ao passo
   de envio. O SSH valida a identidade do servidor e usa a conta restrita.
2. O receptor valida payload, ownership, permissões, serviço e health check.
3. Guarda cópia privada da configuração dedicada anterior, com nome único.
4. Substitui atomicamente **somente** o arquivo dedicado às duas variáveis e
   reinicia **somente** `reembolsa-homolog.service`.
5. Verifica `/api/health` e, por loopback, POST vazio no webhook: sem segredo
   → 403; segredo incorreto → 403; segredo correto → 200. Não são criados
   eventos ou documentos por esses corpos vazios no handler atual.
6. Se a aplicação/testes falharem, tenta restaurar a configuração anterior,
   reiniciar homologação e conferir saúde. Falha da restauração exige operação.

O emissor não reproduz stdout/stderr remotos para evitar vazamento por saída
inesperada. Em falha SSH, timeout, cancelamento ou reinício da máquina, o estado
remoto pode ficar indeterminado: conferir o servidor antes de repetir. O backup
permite recuperação manual, mas não garante reversão em falha abrupta de host.

Para reversão manual, operação identifica a cópia `previous-...env` daquela
execução no diretório protegido, restaura atomicamente o arquivo dedicado
mantendo root:root `0600`, reinicia apenas homologação e verifica saúde. Não
imprimir conteúdo. A retenção/remoção desses backups segue a janela aprovada
pela operação; não há limpeza automática de credenciais nesta preparação.

## O que ainda falta para validar o WhatsApp

- Confirmar se a nova API key pertence a um **canal/número de teste**. Se for
  o canal usado por produção, parar e decidir uma janela/estratégia explícita:
  não redirecionar seu webhook automaticamente.
- Conferir no provedor a validade da chave e o webhook do número específico.
  Na 360dialog, o webhook do número tem precedência sobre o da WABA; modificar
  o da WABA pode afetar outros números. O endpoint público precisa de HTTPS e
  certificado válido. [Documentação 360dialog](https://docs.360dialog.com/docs/messaging/webhook.md).
- Configurar o `Authorization` literal esperado, testar a rota HTTPS pública
  e enviar uma mensagem sintética de um telefone autorizado.
- Confirmar persistência correlacionada ao evento, sem expor telefone,
  documento ou conteúdo em logs públicos. **HTTP 200 não prova gravação**:
  o handler atual persiste em segundo plano, em melhor esforço.
- Integrar identificação, mídia, fila/retries e resposta nos próximos itens
  POC-06/07/08. O teste de configuração não fecha essas entregas nem a POC.

## Evidência desta preparação

- `node --test tools/deploy/whatsapp-homolog.check.mjs`: 35 testes aprovados;
  protocolo/reversão usam adaptadores simulados, não serviços reais.
- `npm test`: 39 arquivos / 462 testes aprovados. `npm run lint`,
  `npm run check` e `npm run build` aprovados; build mantém avisos de tamanho
  de bundle e base Browserslist antiga, sem atualização de dependências.
- Sintaxe Node/shell, YAML, gates declarativos e `git diff --check` validados.
- Nenhuma conexão SSH de deploy, chamada ao provedor, envio de mensagem,
  alteração de configuração ou reinício foi feito para testar esta mudança.
- O teste real de instalação, autenticação pública e recebimento está pendente.

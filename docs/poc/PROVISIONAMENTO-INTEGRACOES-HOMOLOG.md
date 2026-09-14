# Provisionamento das integrações da homologação

Implementação preparada em 14/09/2026. Não executar como publicação automática no push. O fluxo exige revisão, merge em `main`, bootstrap local e acionamento manual do workflow `provisionar-integracoes-homolog.yml` com referência da mudança. O envio é SSH com chave de host fixada; os valores seguem somente pelo stdin. Nenhum secret é exportado em artifact, argumento ou log.

## Contrato

| Origem GitHub | Destino no runtime |
| --- | --- |
| `secrets.API_KEY` | `DIALOG_360_API_KEY` |
| `secrets.API_GOOGLE_MAPS` | `GOOGLE_MAPS_API_KEY` |
| `secrets.API_NFE_IO` | `API_NFE_IO` |

O receptor aceita somente JSON versão 1 com esses três campos de destino, todos obrigatórios, com limites de tamanho e caracteres. Nenhum caminho, comando ou nome de serviço vem do payload. O segredo do receptor `DIALOG_360_WEBHOOK_SECRET` é gerado no servidor com 256 bits de entropia e prefixo `Bearer`, ou preservado se já existir. O receptor habilita `POC_MAPS_ENABLED=true` e define `NFE_IO_ENABLED=false` apenas se a variável estiver ausente/vazia. Ele não cria orçamento fiscal, não habilita worker e não configura o webhook no provedor.

Se `WHATSAPP_POC_ENABLED=true`, o receptor aborta antes de backup ou escrita. Essa condição evita que completar credenciais ative indiretamente o worker no reinício. A ativação do canal e seu destino pertencem à etapa seguinte, após verificação explícita do provedor.

## Bootstrap local a executar pelo operador

1. Confirmar usuário de serviço `reembolsa-homolog`, banco `reembolsa_homolog`, usuário MySQL `reembolsa_homolog_app`, bind `127.0.0.1` e EnvironmentFile único `/etc/reembolsa/homolog.env`, root:root 0600. A unidade precisa ter `WorkingDirectory=/srv/reembolsa/homolog/app`.
2. Instalar `tools/deploy/provisionar-integracoes-homolog-receiver.mjs` como `/usr/local/libexec/reembolsa-integracoes-homolog.mjs`, root:root 0644, fora da árvore gravável pela aplicação. Instalar o wrapper `provisionar-integracoes-homolog-command.sh` em `/usr/local/sbin/reembolsa-integracoes-homolog`, root:root 0755.
3. Criar `/etc/reembolsa/integracoes-homolog-backups`, root:root 0700. O wrapper usa `/etc/reembolsa/.homolog-isolation.lock`, o mesmo lock da operação de isolamento.
4. Criar uma identidade SSH dedicada `integracoes-homolog-deploy`. A chave autorizada deve usar `restrict,command="/usr/bin/sudo -n /usr/local/sbin/reembolsa-integracoes-homolog"`. Manter `authorized_keys` e seus diretórios fora do controle de escrita dessa conta. Não conceder shell irrestrito nem permissões gerais de sudo. Autorizar somente o wrapper sem argumentos no sudoers; validar o arquivo com `visudo -cf`.
5. Gerar par SSH exclusivo para esse fluxo e cadastrar a chave privada em `HOMOLOG_SSH_PRIVATE_KEY`. Cadastrar em `HOMOLOG_SSH_KNOWN_HOSTS` a chave pública real do host obtida por acesso local confiável; não confiar apenas em `ssh-keyscan` remoto. O IP ou hostname configurado deve coincidir exatamente com a entrada conhecida.
6. Cadastrar `HOMOLOG_SSH_HOST`, `HOMOLOG_SSH_PORT` e `WHATSAPP_HOMOLOG_ENABLED=true` no escopo de variáveis usado pelo workflow. Conferir colisões com secrets/variáveis homônimos do ambiente `homologacao`; o escopo de ambiente pode prevalecer sobre o de repositório.

Em 14/09, o token disponível conseguiu GET de `/actions/secrets/public-key` com HTTP 200. Isso permite obter a chave pública necessária à cifragem de secrets, mas **não comprova permissão de escrita** para cadastrá-los. Nenhum valor ou chave pública foi impresso nessa verificação.

## Aplicação e recuperação

O workflow valida referência, ativação e protocolo com dados sintéticos, então envia por SSH para a conta restrita. O receptor valida isolamento, arquivo de ambiente e saúde antes da troca. Salva backup root:root 0600, substitui o env atomicamente, reinicia somente `reembolsa-homolog.service` e confere health e três POSTs vazios ao webhook local: sem autenticação deve retornar 403, segredo errado 403 e segredo correto 200. O corpo vazio não produz evento, mensagem ou recibo.

Falha após a escrita restaura o ambiente anterior e reinicia a mesma unidade, verificando saúde. Se a recuperação também falhar, o erro sanitizado é `APPLY_FAILED_ROLLBACK_FAILED_MANUAL_RECOVERY_REQUIRED`; o operador deve restaurar o backup identificado no diretório privado e verificar a unidade. Não há alteração de banco ou produção nesse protocolo.

Após sucesso, ainda é necessário: verificar a validade da chave 360dialog; configurar a URL e o mesmo Authorization no provedor; confirmar HTTPS e persistência real; habilitar o worker em etapa própria; provisionar orçamento e flag fiscal quando aprovados; testar Routes em uma jornada autorizada. A transferência de credenciais não é aceite ponta a ponta.

## Validação

`node tools/deploy/provisionar-integracoes-homolog.check.mjs`: 13 testes passaram, incluindo allowlist, injeção, banco incorreto, worker já habilitado, geração/preservação do segredo, backup, rollback, limite de stdin, ausência de exposição em erro e nomes dos secrets. A revisão independente identificou e corrigiu a ativação indireta do worker ao preencher credenciais. Runtime e GitHub não foram modificados durante a preparação desses arquivos.

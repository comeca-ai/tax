# POC WhatsApp — plano versionado

Este diretório é a fonte de verdade do plano de entrega da POC de WhatsApp
oficial pela 360dialog. Ele transforma a proposta externa em entregas pequenas,
revisáveis e compatíveis com a política de release do repositório.

## Objetivo da POC

Validar com colaboradores reais, em homologação, este caminho completo:

```text
colaborador identificado → envia foto/PDF → despesa é criada
→ recebe confirmação ou pendências → decisão humana é comunicada
```

O WhatsApp é uma superfície de entrada. A fonte de verdade de empresas,
colaboradores, políticas, despesas e decisões continua sendo a Reembolsa.
O agente não pode aprovar, negar, alterar política ou atravessar empresas.

## Escopo da primeira POC

Inclui:

- recebimento de mensagem, imagem e PDF pelo canal 360dialog;
- identificação do colaborador por telefone E.164 e bloqueio seguro de número
  desconhecido, suspenso ou sem vínculo;
- criação de despesa a partir do comprovante, com origem `whatsapp`;
- pergunta e persistência dos campos estritamente pendentes;
- confirmação de recebimento, pendência e decisão;
- fila persistente para saídas, idempotência no banco e retentativas;
- APIs de serviço internas, documentadas e autenticadas;
- testes automatizados, homologação e evidência manual do fluxo.

Ficam para uma fase posterior: escolha de empresa para múltiplos vínculos,
consulta de despesas, check-in de localização, console operacional e SLA de
produção. Nada impede que sejam planejados; apenas não bloqueiam a prova de
valor do fluxo principal.

## Entregas e branches

Cada item abaixo terá uma branch curta, um PR e uma revisão independente. A
branch atual (`feat/whatsapp-poc-foundation`) entrega somente este plano e o
contrato inicial; ela não altera comportamento de produção.

| ID | Status | Branch prevista | Entrega | Critério de aceite |
|---|---|---|---|---|
| WP-00 | Mesclado | `feat/whatsapp-poc-foundation` | plano, contrato inicial e decisão de arquitetura | documentação revisada e nenhum segredo no Git |
| WP-01 | Mesclado | `feat/whatsapp-poc-mensageria` | tabelas aditivas de sessão, inbox/outbox e chave de idempotência | migração testada, rollback e reentrega sem duplicação |
| WP-02 | Mesclado | `feat/whatsapp-poc-api-servico` | autenticação de serviço e APIs internas versionadas | token inválido bloqueado; empresa isolada; contrato testado |
| WP-03 | Em revisão | `feat/whatsapp-poc-identificacao` | resolver telefone e estado do colaborador | telefone estranho não revela tenant; vínculo suspenso é recusado |
| WP-04 | Planejado | `feat/whatsapp-poc-comprovantes` | baixar mídia, validar arquivo e abrir/complementar despesa | mesma mensagem não cria duas despesas; arquivo perigoso é recusado |
| WP-05 | Planejado | `feat/whatsapp-poc-conversa` | máquina de estados para pendências e respostas | transições e expiração cobertas por testes |
| WP-06 | Planejado | `feat/whatsapp-poc-decisao` | evento de decisão e mensagem transacional ao colaborador | callback idempotente, assinado e auditável |
| WP-07 | Planejado | `feat/whatsapp-poc-aceite` | roteiro E2E, evidência de homologação e preparação de release | cenário completo aprovado em homologação |

WP-01 a WP-06 não entram em produção isoladamente. Podem ser validadas em
homologação, mas a ativação do canal ficará atrás de uma configuração explícita
até o aceite de WP-07.

## Regras não negociáveis

1. Nenhuma chave, número, documento, conversa ou dump de banco entra no Git.
2. Toda operação é associada à empresa antes de ler ou gravar uma despesa.
3. Toda mensagem de entrada e saída tem identificador externo e uma chave de
   idempotência protegida no banco.
4. A resposta HTTP ao webhook é rápida; processamento lento usa a fila
   persistente. Não existe fila somente em memória.
5. Falhas de mídia, envio ou integração não podem duplicar despesa nem vazar
   informação para outro telefone.
6. Alterações de esquema são aditivas e compatíveis com a aplicação anterior.
7. Produção recebe apenas uma tag aprovada, conforme
   [a política de release](../POLITICA-DE-RELEASE-E-DEPLOY.md).

## Dependências externas

Antes de WP-04, precisam estar disponíveis em homologação: canal 360dialog,
webhook configurado, templates aprovados, credencial de teste e um destino de
armazenamento de mídia. Credenciais são inseridas exclusivamente no ambiente.

Antes de WP-07, produto define os textos finais, os campos que podem ser
perguntados e a pessoa responsável pelo aceite. Se localização for adicionada
em fase posterior, haverá decisão específica de consentimento, retenção e
acesso sob LGPD.

## Como cada PR será validado

Todo PR desta POC deve registrar: risco de dados pessoais, mudanças de banco,
testes executados, teste manual de homologação e plano de reversão. Os comandos
mínimos são:

```bash
npm run check
npm run lint
npm test
npm run build
```

Integrações externas, banco e autorização exigem segunda revisão antes do
merge. Um PR verde não autoriza deploy: a promoção segue a política de release.

Leia também o [contrato inicial da POC](CONTRATO-POC.md).

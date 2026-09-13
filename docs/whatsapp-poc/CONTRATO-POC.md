# Contrato inicial de integração — POC WhatsApp

Este é um contrato de intenção para orientar os primeiros PRs. Os schemas
definitivos serão publicados em `contracts/` junto com a implementação. Nenhum
consumidor externo deve depender deste arquivo como se fosse uma API liberada.

## Autenticação de serviço

As rotas da POC não reutilizam sessão de usuário. Elas usam uma credencial de
serviço, injetada no ambiente, com rotação possível. Toda chamada leva um
identificador de correlação e é registrada sem conteúdo de documento ou segredo.

Uma credencial inválida recebe resposta genérica; respostas nunca revelam se um
telefone, colaborador ou empresa existe.

## Operações da primeira fase

| Operação | Finalidade | Invariantes |
|---|---|---|
| Resolver colaborador por telefone | Vincular a mensagem a pessoa e empresa | E.164 normalizado; retorno vazio para número não autorizado; tenant nunca é inferido pelo cliente |
| Abrir despesa por comprovante | Criar despesa de origem WhatsApp | mídia validada; `messageId` único; política da empresa associada |
| Complementar despesa | Anexar mídia ou campos pedidos | despesa pertence ao colaborador; mesmo `messageId` é seguro para reentrega |
| Consultar estado da despesa | Preparar a resposta conversacional | somente dados apresentáveis ao próprio colaborador |
| Publicar decisão | Notificar resultado de decisão já tomada | evento assinado, idempotente e auditável |

### Identificação já publicada para revisão

`GET /api/v1/colaboradores?telefone=%2B5511999999999`

Exige `Authorization: Bearer <token de serviço>`. O telefone deve estar em
E.164 estrito, é comparado por igualdade exata após remover o `+` e nunca é
registrado no log da rota. A resposta é `{ "colaboradores": [...] }`; número
desconhecido recebe `{ "colaboradores": [] }`. Cada item contém somente
`colaboradorId`, `empresaId`, `empresaNome`, `nome`, `situacao`, `politicaId`
e `tags`. Não inclui e-mail, documento, CNPJ, senha ou dados de sessão.

## Modelo de eventos

O webhook é apenas a porta de entrada. Cada evento aceito é gravado na inbox
antes de ser processado; cada resposta é gravada na outbox antes do envio. Os
identificadores externos recebidos da 360dialog e os identificadores internos de
eventos são únicos. Uma tentativa repetida deve retornar o resultado já criado,
nunca repetir efeitos.

Estados mínimos da outbox: `pendente`, `processando`, `enviado`, `falhou` e
`cancelado`. Retentativas devem ter limite, atraso progressivo e motivo
registrado. A falha definitiva fica observável para operação, sem bloquear a
despesa original.

## Mídias e privacidade

- aceitar somente tipos, tamanho e origem permitidos;
- baixar mídia usando credencial de servidor e armazená-la fora do repositório;
- durante a POC, o adaptador `database` guarda o binário privado no MySQL e
  registra provedor, hash e tamanho; a mesma interface permite mover apenas
  os binários novos para S3/R2 posteriormente;
- registrar hash, tipo, tamanho e relação com a despesa;
- não gravar binários, URLs assinadas ou payloads completos em logs de aplicação;
- limitar acesso ao arquivo à empresa e às permissões já existentes;
- definir retenção e eliminação antes de abrir o canal a usuários reais.

## Fora do contrato inicial

Múltiplas empresas por telefone, consulta de período, OCR novo e console de
operação continuam fora deste contrato inicial. Geolocalização, conciliação e
integridade documental recebem contratos próprios no [roadmap completo](../poc/README.md)
(D-023). O aceite deste contrato não conclui sozinho a POC ampliada.

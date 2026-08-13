# Módulos — separação dos motores (D-013 / D-014)

Dois motores independentes. Decisões e trilhas não se misturam.

## `reembolso/` — o agente do colaborador

> Só **extrai e verifica**. Ninguém preenche nada. Negado é negado.

| Pasta | Papel |
|---|---|
| `agente/` | Máquina de estados da conversa, processamento de mensagens, convite-isqueiro (wa.me) |
| `policy/` | Parser da política de reembolso (PDF → regras) + avaliador de despesa contra as regras |
| `whatsapp/` | Transporte: adapter `WHATSAPP_PROVIDER=evolution|meta`, payload Evolution, envio de texto |

Contrato do decisor: `APROVADA(regra citada)` / `REPROVADA(regra citada)` /
`REVISAO_MANUAL(motivo material)` — só aprova com regra explícita da política
(D-013). Dúvida material vai para o gestor; o sistema nunca sugere nem acrescenta
nada na política.

## `fiscal/` — a apuração tributária

> Entra **depois**, separado, com regras próprias (D-014).

| Pasta | Papel |
|---|---|
| `engine/` | Motor de regras tributárias (RF-00 a RF-09): créditos, alíquotas, regime |
| `ocr/` | Provider plugável de extração de notas (NF-e XML, imagem, PDF) |
| `cnpj/` | Consulta de CNPJ na Receita Federal (ReceitaWS) |

O "preenchimento assistido" mora aqui (superfície web do back office) — nunca no
fluxo do colaborador.

## Fora dos módulos (plataforma compartilhada)

`api/auth/`, `api/lib/`, `api/mail/`, `api/queries/`, `api/routers/` (superfície
web tRPC), `db/`, `contracts/` — infraestrutura comum aos dois motores.

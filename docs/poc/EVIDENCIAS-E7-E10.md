# Evidências E7–E10 — 13/09/2026

Referências: `k2/Doze Entregas da PoC - reembolsa.docx` e reconciliação K2. Responsável pela implementação e registro desta frente: agente Codex, sem representar uma pessoa ou assinatura contratual.

## Resultado implementado nesta rodada

- E9: recepção WhatsApp verifica checksum antes de criar nota/despesa. A transação serializa a empresa; outro remetente da mesma empresa reenviando o binário recebe indicação de duplicata, sem revelar ID ou identidade do registro original. O worker encerra o processamento com uma resposta explícita; a porta HTTP retorna 409.
- E10/E1: mídia extraída passa pelo mesmo decisor puro e consolidação da política ativa usados no painel. Decisão, regras, versão, modo e status aplicado são registrados na trilha na transação de criação. Configuração ausente ou promovida para outra versão de política resulta em sombra. Sombra registra sem divulgar decisão; assistido sugere e mantém revisão; autônomo aplica o veredito da política. Nenhum destes atos executa pagamento.
- A resposta é persistida na inbox. Retry recupera a resposta original sem chamar OCR ou decidir novamente.

## Verificações executadas

- 21 testes focalizados de comprovanteDb, worker, router e decisão: passaram. Incluem veredito igual nos três modos, sombra por ausência de configuração/versão divergente, ausência de OCR/política inválida, bloqueio de duplicata e interrupção da conciliação após duplicata.
- Teste com MySQL/MariaDB local isolado: caso WhatsApp executou os três modos, verificou decisão e versão persistidas, trilha, replay e bloqueio de binário reenviado por outro colaborador. Este caso passou. A execução completa teve 12 testes passando e 1 falhando na FK de veículo da frente E4, cuja migração estava sendo corrigida pelo agente responsável. O resultado global deve ser consultado na rodada final.
- A extração e a política dos testes são fixtures sintéticas; o banco e as transações foram reais. Não houve envio de WhatsApp, chamada de OCR externo ou consulta fiscal nesta rodada.

## Aceites ainda não demonstrados

| Entrega | Evidência presente | Limitação que impede aceite integral |
| --- | --- | --- |
| E7 | OCR admite chave; validador verifica 44 dígitos/DV e documento de campo descarta chave inválida sem bloquear arquivo | Não há prova de extração correta em DANFE e NFC-e reais. Chave documental ainda depende de importação no contexto de veículo/jornada; não está universalmente persistida no cadastro da nota. |
| E8 | Adapter NFE.io e serviço administrativo com orçamento, idempotência e resultado persistido | Consulta não é feita automaticamente no envio e resultado não governa o decisor. NF-e modelo 55 não comprova cobertura NFC-e. Não houve consulta fiscal real. O log da decisão WhatsApp declara `validacaoFiscal: nao_consultada`; aprovação pela política não certifica validade fiscal. |
| E9 | Bloqueio de binário idêntico antes da despesa no caminho WhatsApp; índice de documentos por empresa/chave/hash existente | Mesma chave com arquivos diferentes ainda pode chegar à despesa antes da importação de campo. Não foram entregues detector de manipulação, pares semânticos ou taxa de falso positivo em amostra rotulada. Outros caminhos de criação devem adotar a mesma reserva para garantia global. |
| E10 | Canal oficial 360dialog já é padrão; identidade ativa única, allowlist, recepção, OCR, decisão, modo, resposta persistida e recuperação | Falta foto e resposta reais em número homologado, com prova ponta a ponta e validação do webhook/credenciais. Não confundir aprovação de política com validação fiscal ou pagamento. |

A ponte de quilometragem K2 para plausibilidade fiscal continua exigindo prova integrada da origem do km; o motor já possui tolerância de 15%, mas sua existência isolada não prova a ponte. E12 não deve ser encerrada com estes testes sintéticos.

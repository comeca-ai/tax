# PI-004 — política de exemplo para homologação

Leitura local em 13/09/2026, sem API externa. Documento fornecido pelo usuário:
`/root/PI-004 Política de viagem e reembolso.pdf`, 6 páginas.
SHA-256: `8012e9783af382c577fa021822abd95aebae2133f547e15865abc00750862d11`.

Status: referência de testes, NÃO cadastrada nem ativada em qualquer empresa.
O PDF original não foi copiado para o repositório. Este resumo não substitui o documento.

## Regras explícitas e cenários de aceitação

| Fonte | Regra | Cenário a validar |
| --- | --- | --- |
| pp. 2–3, responsabilidades | Gestor e Financeiro participam da aprovação | Um comprovante válido não autoriza aprovação automática nem pagamento |
| p. 3, 4.1.3 | Passagens aéreas, hotéis e locação não são reembolsáveis, salvo autorização prévia do CEO | Exceção documentada precisa de revisão; não negar toda hospedagem incondicionalmente |
| p. 4, 4.1.7 | Alimentação exige nota ou cupom fiscal; comprovante de cartão/banco e documento manual não servem | Distinguir documento fiscal de comprovante de pagamento |
| p. 4, 4.1.7 | Pedágio aceita ticket/extrato; estacionamento manual exige local e placa; táxi tem condições específicas | Não exigir NF-e modelo 55 indiscriminadamente para todas as despesas |
| p. 4, 4.1.8 | Bebida alcoólica não é reembolsável | Identificar o item; não rejeitar automaticamente todos os itens de uma refeição mista |
| p. 4, prazos | Despesas com até 30 dias de retroatividade | Testar 30/31 dias após definir data de referência e fuso |
| pp. 4–5, 4.2.1 | Veículo próprio: R$ 0,95/km, pré-aprovação e comprovação de percurso/horários | 100 km correspondem a R$ 95,00 antes das demais verificações; não converter em tarifa por litro |
| p. 5, 4.2.1–4.2.3 | Pedágio no trajeto principal; estacionamento com autorização e justificativa | Exigir contexto e evidência, não só valor da nota |
| p. 5, 4.2.4 | Café da manhã só em reuniões/eventos pontuais avisados previamente | Não aplicar automaticamente a regra de almoço/jantar |
| p. 5, 4.2.5 e 4.3.1 | R$ 90 por almoço ou jantar, com justificativa/aprovação e ressalva para almoço com cliente | R$ 90 e R$ 90,01; duas refeições não são necessariamente um teto de R$ 90 por nota/dia |
| pp. 5–6, cadastramento | Centro de custo, categoria, descrição e comprovante legível | Solicitação incompleta deve pedir complementação |

## Pendências que não podem ser inventadas pelo sistema

- Pagamentos nos dias 15 e 30: documento define lançamentos de 21 a 05 e de 06 a 19, mas omite o dia 20. Não define fevereiro, feriados ou fins de semana.
- Prazo de 30 dias: confirmar referência operacional e fuso. Antecedência de viagem é de um mês, não necessariamente 30 dias.
- O documento identifica uma empresa, mas menciona contratos de outra na página 3. Confirmar aplicabilidade antes de ativar.
- Campos de aprovação, data e histórico de revisões estão sem preenchimento no texto extraído; vigência não confirmada.
- A política exige solicitação pelo Caju. Substituir esse canal por esta POC requer concordância explícita, não alteração silenciosa do texto.
- R$ 0,95/km não autoriza reembolso adicional de combustível nem define política fiscal de combustível.
- A ressalva de almoço com cliente não define novo teto ou dispensa geral de aprovação.

## Cobertura técnica nesta entrega

`api/modules/reembolso/policy/pi004.test.ts` usa uma transcrição manual e parcial de regras para testar as salvaguardas do motor existente: sem autorização automática, sem promover regra de refeição para toda alimentação e sem transformar exceção em vedação irrestrita.

Esses testes NÃO validam extração automática do PDF, prazo de 30 dias, cálculo de quilometragem, calendário de pagamento, hierarquia completa ou integração Caju. O avaliador atual recebe categoria, valor e presença de evidência; faltam nele contexto temporal, itens e autorizações para executar todas as regras acima. O contrato atual também não possui categoria de quilometragem nem unidade R$/km: manter essa regra documentada, sem mapeá-la para combustível ou para um teto global.

Próximo passo de ativação: revisão do rascunho por administrador da empresa correta, resolução das pendências e testes de integração. Nenhuma política existente foi substituída.

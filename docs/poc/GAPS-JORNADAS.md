# Jornadas B2B/B2C — lacunas para fechar a POC

Comparação em 13/09/2026 com as cinco páginas de
`jornadas-b2b-b2c-poc-v2.pdf`, versão de trabalho de 07/09/2026.
O arquivo original está em `/root/dicussoes/`; não foi copiado para o Git.

## Conclusão

O documento complementa o roadmap: organiza o aceite pela experiência de um
mesmo caso, não apenas pela existência de módulos. B2B é a empresa operando o
backoffice; B2C é seu colaborador usando somente WhatsApp, não uma oferta direta
ao consumidor. Os estados de implementação descritos no PDF são históricos,
não comprovação do código ou da produção em 13/09.

Não é necessário criar outro conjunto de tarefas. Os requisitos adicionais
entram nas 17 entregas existentes e no roteiro integrado de POC-16.

## Lacunas explicitadas pelas jornadas

| Lacuna / referência no PDF | O que falta provar | Entrega |
|---|---|---|
| Um caso atravessa os dois públicos — pp. 1–3 | Mesma identidade de caso liga empresa, pessoa, mensagens, pontos, documento, política, cálculo e decisão; o colaborador conclui sem outra interface | POC-02, POC-08, POC-16 |
| Backoffice mínimo conectado — pp. 2–3 | Cadastro, política, fila, detalhe do trajeto/documento, motivo e retorno funcionam juntos; ter telas isoladas não basta | POC-03, POC-08, POC-10, POC-16, POC-17 |
| Operação técnica — p. 3 | Equipe autorizada localiza uma falha pela correlação e reprocessa sem duplicar valores ou cruzar empresas; pode usar ferramenta interna mínima, sem novo portal obrigatório | POC-01, POC-02, POC-06, POC-16 |
| OCR avaliável — pp. 3, 5 | Campos do piloto e confiança por campo avaliados com documentos controlados; resultado ausente/incerto não é preenchido como certeza | POC-07, POC-11 |
| Autenticidade mensurável — pp. 3–5 | Ameaça-alvo, conjunto de teste e limites de falsos positivos/negativos definidos; sinal de manipulação encaminha revisão, não acusação de fraude | POC-12, POC-15, POC-16 |
| Responsáveis e parâmetros do teste — p. 4 | Empresa, usuários, autoridade para arquitetura/implantação, regra de km, documentos, orçamento e metas com aceite nominal | POC-01, POC-03, POC-10, POC-12, POC-15 |
| Handover reproduzível — pp. 4–5 | Equipe interna repete o roteiro com runbook e pacote mínimo de evidências, sem dependência obrigatória de fornecedor | POC-01, POC-16 |

O pacote mínimo de aceite é um conjunto controlado de evidências/testes. Não
inclui construir o produto de dossiê fiscal completo ou um backoffice amplo.
Não deve expor segredos nem dados pessoais fora do escopo autorizado.

## Reconciliar versões antes de encerrar o escopo

| Tema | PDF de 07/09 | Orientação adotada / decisão pendente |
|---|---|---|
| SEFAZ | Expressamente fora da POC, pp. 3–5 | E8 prevê consulta fiscal. D-025 encaminha prova com Focus NFe e NFE.io como alternativa em POC-12; o resultado fundamenta o recorte no aceite. Avaliação não é contratação, integração habilitada ou E8 cumprida; OCR e conciliação não comprovam consulta fiscal externa |
| Mais de uma empresa por telefone | Selecionar empresa se necessário, p. 2 | Plano posterior D-021 adia a seleção. Identidade ambígua deve ser interrompida/tratada sem vazamento; não escolher tenant arbitrariamente |
| Aprovação | Jornada destaca revisão humana, p. 2 | D-024 acrescenta aprovação automática do trajeto quando política validada, perfil, evidências e modo autorizam; humano cuida dos casos exigidos e das exceções |
| Campo | Check-in/check-out experimental e trechos A→B/B→C, pp. 2–3 | D-023 inclui checkpoints por visita, consolidação posterior e conciliação por período. Continua sem rastreamento contínuo |
| Cobrança | Billing/cobrança fora da POC, p. 5 | Solicitar nota pendente via WhatsApp é cobrança documental, não cobrança financeira. D-023 a inclui no aceite |
| Fornecedor K2 | Reunião e definição do escopo do fornecedor pendentes, p. 4 | D-021 orienta construção interna. Reaproveitar perguntas de governança e handover, sem assumir contratação, orçamento ou transferência de responsabilidade |
| Produção | Produção/SLA 24×7 fora da POC, p. 5 | Aceite e release de homologação não autorizam produção. Preparar reversão não altera esse limite |

Google Maps produz uma estimativa, não prova do caminho efetivamente percorrido.
Reproduzibilidade significa auditar pontos, versão da regra, parâmetros, fórmula
e evidência permitida do cálculo; não garantir que nova consulta futura retorne
o mesmo resultado nem armazenar resposta além das condições do provedor.

## Roteiro mínimo que fecha a lacuna B2B ↔ B2C

1. Empresa valida política, cargos, responsabilidades, condições de automação,
   ocupantes reais, veículo e regra de km; registra versão e responsáveis.
2. Colaborador autorizado inicia pelo WhatsApp/360dialog, registra saída,
   visitas e retorno. O sistema vincula os eventos ao mesmo caso/jornada.
3. Consolidação posterior calcula trechos estimados e km comerciais. O
   backoffice mostra origem, regra e resultado; o colaborador recebe retorno.
4. Caso elegível recebe aprovação automática em modo autorizado. Um segundo
   caso com ambiguidade chega à pessoa competente, que resolve e devolve o
   resultado pelo WhatsApp. A aprovação não executa pagamento.
5. Notas de combustível no CNPJ do empregador são ligadas à conciliação do
   período. Ausência provoca solicitação documental; regularização encerra
   lembretes. Jornada, nota, reembolso e análise fiscal mantêm estados próprios.
6. Repetir com eventos duplicados, reinício, falha de provedor, pessoa suspensa,
   tenant ambíguo e documento manipulado do conjunto de teste; demonstrar
   recuperação, revisão e ausência de vazamento ou acusação automática.
7. Equipe interna executa novamente com o runbook e entrega evidências
   correlacionadas, métricas e limites aceitos. Somente então registrar aceite.

As alçadas e os limiares não são inventados por este roteiro: vêm da política
validada e das definições explícitas do teste. O recorte E8 após a prova do
integrador (D-025) e as metas ainda em aberto precisam ser resolvidos antes de
declarar a POC fechada.

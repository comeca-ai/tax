# Evidências da interface — E3, E4, E11 e E12

Data: 2026-09-13. Fonte de aceite: `/root/k2/Doze Entregas da PoC - reembolsa.docx`, seção 2. Revisão técnica local por Codex, agente de interface. Este registro não certifica homologação em produção.

## Implementação desta rodada

- **E3:** `src/components/campo/ConfiguracaoCampo.tsx` permite informar tarifas em centavos/km para cada UF, vale refeição, contrato corporativo de aplicativo, Analista e Aprovador da empresa. A interface seleciona somente colaboradores ativos da empresa; a API continua responsável pela autorização e integridade. A configuração é vinculada à versão da política ativa. Campo vazio de UF permanece sem tarifa, sem valor inventado. O modo já existente continua sendo selecionado explicitamente pelo administrador.
- **E4:** `src/components/campo/VeiculosCampo.tsx`, integrado em `/app/campo` após selecionar colaborador, cadastra placa, RENAVAM, motorização, UF e km/L declarados numa única operação `veiculos.salvar`. Lista somente veículos da pessoa selecionada na empresa ativa. Vínculo suspenso bloqueia cadastro; falhas são exibidas como falhas. A duplicidade é validada pelo endpoint, cuja mensagem é exibida na tela.
- **E11:** `/app/campo` mantém pontos recebidos pelo canal, cálculo de rota e conciliação. Agora permite informar UF e distância comercial em metros para gerar o memorial. A distância comercial é declarada explicitamente; o restante permanece não comercial. O memorial retornado pela API exibe segregação, tarifa, valor e versão da política. Sem UF selecionada, a operação continua sendo apenas conciliação documental. A geração exige distância calculada e tarifa da UF na API.

## Verificações locais

- `npm run check`: passou após integrar os contratos de configuração, veículos e memorial, em 2026-09-13 aproximadamente 17:52 UTC.
- ESLint nos componentes alterados: passou.
- `src/components/campo/VeiculosCampo.test.tsx`: isolamento visual por empresa e pessoa, bloqueio de cadastro no vínculo suspenso e erro de API sem apresentar lista como resultado confirmado.
- `src/components/campo/ConfiguracaoCampo.test.tsx`: política ativa obrigatória, valores não presumidos, erro explícito de consulta e seleção de designados limitada à empresa.
- `src/pages/app/Campo.test.tsx`: restrição administrativa, seleção de pessoa por empresa, erro explícito e estado vazio.
- Os testes de renderização não substituem teste de interação nem provas de isolamento da API e do banco.

## Evidência de navegador existente

[Relatório do ensaio local](evidencias/browser-71b86aa1-02ba-47a2-a882-f1e4d36761a1/report.json), executado de 17:45:12 a 17:45:27 UTC: oito verificações passaram, nove capturas, zero erros de navegador. Cobriu rota protegida, dashboard, revisão, política, upload vazio, seleção de empresa/pessoa no campo, troca de empresa e menu móvel. A sessão foi injetada, os dados foram sintéticos e chamadas externas foram bloqueadas. **Esse ensaio precede os formulários desta rodada e não os comprova.**

## Aceite ainda pendente

| Entrega | Evidência disponível | O que falta para encerrar |
| --- | --- | --- |
| E11 | Código integrado para checkins, rota, conciliação e memorial com tarifa por UF; validações locais | Executar checkins reais pelo número homologado, obter rota do provedor e conferir memorial persistido na interface com dados da empresa; avaliar indisponibilidade do provedor no ambiente de homologação |
| E12 | Suítes locais e ensaio visual sintético com evidência por etapa | Executar roteiro real de E1–E11 nos três modos, comprovar promoção/reversão sombra–assistido, resolver todos os bloqueantes e registrar evidência do canal real |
| E5 | Cadastro individual e convites existentes | Importação em lote, resumo sem gravação, validação linha a linha, vínculo CLT/MEI/PJ e superior direto continuam fora desta implementação |
| E6 | Relatórios fiscais e registro explícito de pagamento na tela Campo | Interface da régua completa por empresa/período e comprovação das cinco dimensões; relatório fiscal por confiança não equivale a essa régua |

A existência de telas, testes verdes ou captura de navegador não permite declarar as doze entregas aceitas. E12 depende dos critérios reais de todas as demais entregas.

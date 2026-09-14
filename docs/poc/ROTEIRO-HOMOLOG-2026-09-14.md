# Roteiro de teste da homologação — 14/09/2026

Endereço do ambiente: **https://homolog.oreembolsobot.app**. Este roteiro descreve a versão integrada preparada em 14/09; o registro de implantação deve confirmar qual artefato está instalado antes do teste. A existência da tela não encerra o aceite das doze entregas.

## 1. Entrar e selecionar a empresa

1. Acesse [Entrar](https://homolog.oreembolsobot.app/login) e use seu e-mail e sua senha já cadastrados. Não há credencial de teste publicada neste documento.
2. As sessões antigas deixam de valer com a atualização de segurança: faça login novamente. Se houver redirecionamento repetido, use uma janela privativa e entre de novo.
3. Confira a empresa selecionada no menu superior antes de alterar qualquer cadastro. Para equipe, parâmetros e campo, use o administrador dessa empresa.
4. Abra [Painel](https://homolog.oreembolsobot.app/app/dashboard), [Despesas](https://homolog.oreembolsobot.app/app/despesas) e [Relatórios](https://homolog.oreembolsobot.app/app/relatorios). Confira empresa, carregamento e ausência de erro. Os números ilustrativos da página de login não são indicadores da empresa.

**Resultado esperado:** acesso à empresa correta; rotas internas exigem sessão. Se não conseguir entrar com sua conta, registre o erro; o roteiro não cria nem presume uma senha alternativa. Recuperação por e-mail depende do serviço de envio operacional.

## 2. Conferir política e parâmetros — E1 e E3

1. Abra [Política](https://homolog.oreembolsobot.app/app/politica). Confira o documento e a versão ativa. Se ainda não houver política, use o fluxo de envio, revise a extração e ative a versão aprovada pela empresa. Extração depende do provedor configurado.
2. Abra [Campo e conciliação](https://homolog.oreembolsobot.app/app/campo) e expanda **Parâmetros da política de campo**.
3. Comece em **Sombra**. Preencha tarifa, período de conciliação, prazo para nota, intervalo e limite de lembretes e retenção de localização conforme a política. Os campos de tarifa usam **centavos por km**: 150 representa R$ 1,50/km.
4. Confira vale refeição e contrato corporativo de aplicativo. Designe analista e aprovador entre pessoas ativas da própria empresa; pode voltar aqui após importar a equipe. Sem aprovador designado, o administrador responde pela revisão.
5. Expanda **Tarifas por UF (centavos por km)** e configure as UFs que serão usadas. Tarifa geral preenchida não substitui a tarifa da UF exigida no memorial.
6. Preencha **Regra de percurso comercial** a partir da política e clique **Salvar parâmetros**. Recarregue e confira a persistência.
7. Faça a troca **Sombra → Assistido → Sombra**, salvando cada etapa. A equipe técnica deve correlacionar as mudanças com a trilha de autoria e horário. O teste em **Autônomo** integra o ensaio controlado abaixo.

**Resultado esperado:** configuração vinculada à versão ativa; pessoas de outra empresa não aparecem como responsáveis. Alterar o modo pela tela, sozinho, não comprova efeitos corretos sobre decisão, status e comunicação.

## 3. Importar equipe com prévia — E5

1. Abra [Equipe](https://homolog.oreembolsobot.app/app/equipe), localize **Importar equipe em lote** e clique **Baixar modelo CSV**.
2. Exporte sua planilha em **CSV UTF-8**, com até 100 pessoas e 200 KB. Mantenha este cabeçalho e a ordem das colunas:

   ```csv
   nome;email;telefone;matricula;vinculo;superiorMatricula;equipe
   ```

3. Use telefone internacional com `+` e código do país; vínculo `CLT`, `MEI` ou `PJ`; equipe `interna` ou `externa`. Em `superiorMatricula`, use a matrícula do superior da própria empresa ou do mesmo lote. Deixe vazio quando não houver superior.
4. Para conferir a validação, faça uma cópia do arquivo com telefone inválido e matrícula repetida. Selecione a cópia em **Planilha CSV** e clique **Validar e ver resumo**. Confira erros por linha e que nenhuma pessoa foi cadastrada.
5. Selecione o arquivo corrigido e valide novamente. Confira quantidade, vínculo e superior de cada pessoa. A prévia não cadastra nem convida.
6. Para testar só o cadastro, mantenha desmarcada **Também autorizo o envio dos convites após o cadastro** e clique **Confirmar cadastro das pessoas**. Confira a quantidade importada e a mensagem de que convites não foram solicitados.
7. O envio é opcional e tem confirmação própria: quando o canal estiver liberado e os destinatários forem os autorizados, marque a opção e use **Confirmar cadastro e envio de convites**. Confira o resultado individual de WhatsApp e e-mail; cadastro concluído não significa convite entregue.

**Resultado esperado:** erros impedem confirmação; prévia não grava; somente confirmação cadastra. Se a prévia expirar ou o cadastro mudar antes da confirmação, gere outra prévia. XLSX deve ser exportado para CSV. O vínculo de superior foi implementado no cadastro; o encaminhamento real da revisão ao superior ainda exige demonstração integrada.

## 4. Cadastrar veículo — E4

1. Em **Campo e conciliação**, selecione **Colaborador da empresa ativa**.
2. Em **Veículos da pessoa selecionada**, informe placa, RENAVAM, motorização, UF de licenciamento e consumo declarado em km/L. Use **Cadastrar veículo** e confira a lista após recarregar.
3. Tente repetir a mesma placa para a mesma pessoa: o cadastro duplicado deve ser rejeitado.
4. Se sua conta acessa duas empresas, troque a empresa pelo menu. A seleção de pessoa deve ser limpa, e a lista deve conter apenas a equipe da nova empresa.

**Resultado esperado:** os cinco campos ficam vinculados à pessoa correta. Validar cadastro não comprova ainda a integração completa do consumo ao cálculo fiscal.

## 5. Enviar e revisar despesa pelo painel — E2, E7 e parte de E10

1. Abra [Nova despesa](https://homolog.oreembolsobot.app/app/despesas/nova) e envie um comprovante autorizado do piloto. Confira os campos extraídos, conclua as etapas apresentadas e registre o identificador da despesa.
2. Abra **Despesas**, confira o detalhe e a empresa. Documento incompleto ou extração indisponível deve permanecer com pendência visível; não substitua resultado ausente por uma aprovação presumida.
3. Quando o caso exigir revisão, abra [Fila de revisão](https://homolog.oreembolsobot.app/app/revisao), confira a mesma despesa, os dados e a justificativa. Faça uma decisão autorizada e registre o resultado.
4. Se decidir no lugar de um aprovador designado, informe o motivo solicitado. Com conta sem atribuição de revisão, confira que a operação é bloqueada. Não use credenciais de outra pessoa.

**Resultado esperado:** despesa e fila pertencem à empresa selecionada; decisão tem justificativa e trilha. O envio web não comprova recebimento de foto nem resposta pelo WhatsApp. A extração de chave de 44 dígitos em DANFE/NFC-e reais e sua persistência ainda precisam de evidência correlacionada.

## 6. Campo, combustível e conciliação — E11

Esta etapa depende de jornadas e notas reais recebidas pelo canal homologado. A tela atual consulta os pontos recebidos pelo WhatsApp; não oferece formulário manual de check-in.

1. Após a liberação técnica do canal, registre saída, visitas e retorno pelo fluxo de campo da conversa. Volte a **Campo e conciliação**, selecione a pessoa e confira **Jornadas e cálculo posterior → Consultar pontos**: ordem, horários, placa e encerramento.
2. Na jornada encerrada, use **Calcular rota**. Com Google Maps habilitado e disponível, confira a distância estimada. Indisponibilidade deve manter a distância pendente; zero não substitui uma rota não calculada.
3. Em **Documentos de combustível**, selecione a nota recebida pelo WhatsApp e informe a placa cadastrada. Use **Importar documento** e confira os dados extraídos e as pendências. O servidor verifica o vínculo entre nota, pessoa e empresa.
4. Confira a nota e registre o motivo da revisão quando aplicável. A tela não permite preencher manualmente chave, litros ou CNPJ para simular extração. Conferência humana não é autenticação pela SEFAZ.
5. Em **Conciliação por período**, informe início, **fim exclusivo** e placa. Para incluir o memorial, escolha a UF configurada e informe a distância comercial em **metros**. Ela não pode exceder a distância estimada consolidada.
6. Clique **Conciliar período**. Confira quilômetros estimados, litros documentados, pendências, versão, metros comerciais/não comerciais, tarifa, valor e versão da política. Exemplo de conferência aritmética: 10.000 metros comerciais × R$ 1,50/km = R$ 15,00, desde que esse percurso seja elegível pela política.

**Resultado esperado:** memorial rastreável e pendências explícitas. Rota estimada não prova o caminho percorrido; litros comprados não medem consumo. Lembrete agendado não comprova entrega de mensagem. O fechamento desta etapa requer canal, Maps e ponte fiscal funcionando no mesmo caso.

## 7. Pagamento e indicadores — E6

Em **Campo e conciliação → Registro de pagamento da empresa**, é possível selecionar despesa aprovada e registrar referência, data e horário de pagamento já realizado. Não há transferência bancária ou PIX. Use apenas um caso autorizado e confira a confirmação e a trilha.

**Limite atual:** o registro de pagamento é separado; a despesa não passa automaticamente a um estado `paga`. Os quatro contadores de campo e os relatórios existentes não comprovam as cinco dimensões da régua por empresa/período, nem auditoria por amostra e tempo até pagamento. E6 continua parcial.

## 8. Ensaio final e pendências externas — E8 a E12

| Entrega | O que precisa ser demonstrado para aceite |
| --- | --- |
| E7 — chave fiscal | Extração correta de DANFE e NFC-e reais autorizados; chave inválida não persistida e envio preservado. |
| E8 — consulta ao fisco | Consulta no envio, resultado anexado à despesa, cancelamento/inexistência em revisão e indisponibilidade explícita. Consulta manual ou conferência da nota não substituem esse fluxo. O recorte do integrador fiscal continua pendente de prova. |
| E9 — antifraude | Reenvio bloqueado antes de nova despesa, par quase idêntico encaminhado à revisão, manipulação sinalizada e falso positivo medido em amostra rotulada. Testes de duplicidade isolados não encerram E9. |
| E10 — 360dialog | Número de teste e webhook confirmados; convite, pessoa e empresa vinculados; foto chega, gera despesa/decisão e resposta com regra na conversa. Número desconhecido não pode criar despesa. |
| E11 — campo | Check-in, visitas, retorno, Maps, segregação comercial, memorial e conciliação fiscal correlacionados no mesmo caso. |
| E12 — ensaio | Uma empresa real autorizada executa o fluxo completo nos três modos, com evidência por etapa, promoção/reversão e nenhum defeito bloqueante. |

O coordenador deve confirmar a liberação operacional e o saldo do limite autorizado de chamadas externas antes da etapa com provedores. O ensaio não deve disparar mensagens para pessoas fora do grupo autorizado. Não se apresentam número do canal, credenciais ou integrações como disponíveis sem essa verificação.

No ensaio dos modos, compare casos equivalentes controlados: **Sombra** registra o veredito e preserva o status, sem comunicação da decisão; **Assistido** registra a sugestão e exige confirmação humana; **Autônomo** aplica o efeito autorizado. O veredito deve permanecer igual para a mesma evidência. Coordene os casos para que o teste legítimo de duplicidade não seja confundido com falha de modo. Termine retornando a empresa ao modo acordado e confira a auditoria.

## Registro do teste

Para cada etapa, anote: horário, empresa, pessoa de teste, versão instalada, identificação da despesa/jornada/lote, ação, resultado esperado, resultado obtido e evidência. Compartilhe capturas sem senha, token de convite, chave de API ou dados pessoais desnecessários.

| Etapa | Resultado: passou / falhou / pendente | Identificador e evidência |
| --- | --- | --- |
| Login e empresa | A preencher | A preencher |
| Política, UF e modos | A preencher | A preencher |
| Prévia, erros e confirmação CSV | A preencher | A preencher |
| Veículo e isolamento | A preencher | A preencher |
| Despesa e revisão | A preencher | A preencher |
| Canal, campo, combustível e memorial | A preencher | A preencher |
| Pagamento e métricas | A preencher | A preencher |
| Três modos e reversão final | A preencher | A preencher |

## Relatórios publicados e base desta revisão

- [Painel de entregas e relatórios atuais](https://oreembolsobot.app/relatorios/poc-entrega-20260913-ff495cce4ade/index.html).
- [Análise K2 e downloads PDF, Word, planilha e CSV](https://oreembolsobot.app/relatorios/k2-20260913-b7ccdb990f/index.html?v=2-github-5f3484e). Em **14/09/2026 às 01:34:53 UTC**, os seis arquivos do manifesto público retornaram HTTP 200 e SHA-256 correspondente: HTML, PDF, Markdown, XLSX, DOCX e CSV. A análise K2 v2 preserva o retrato do commit `5f3484e`; não é evidência da versão integrada instalada hoje.
- [Revisão de compromissos e entregas](REVISAO-ENTREGAS-2026-09-14.md) e [escopo das doze entregas](ESCOPO-COMPLETO-ESTRUTURADO.md).

Roteiro conferido contra as rotas e telas atuais de login, política, importação de equipe, revisão e campo, além dos contratos das APIs de equipe, veículos e campo. Resultados de testes locais e implantação devem ser associados ao artefato pelo relatório de execução; este documento não substitui o aceite humano.

Verificação visual local concluída em **14/09/2026 às 01:37:19 UTC**: 8 verificações passaram, 9 capturas, nenhum erro de execução no navegador e limpeza dos dados sintéticos concluída. Cobertura: rota protegida, painel autenticado, fila/detalhe, política ativa, tela de upload, seleção de pessoa por empresa, troca de empresa e navegação móvel. O teste usou sessão sintética, banco descartável e bloqueio de chamadas externas; não valida senha real, envio de arquivo, CSV pela interface, WhatsApp ou provedores. [Evidência técnica](evidencias/browser-e8c1bde8-ca02-41d6-ba72-e08d3153900b/report.json).

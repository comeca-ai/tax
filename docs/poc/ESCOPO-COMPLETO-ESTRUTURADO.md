# Escopo completo da POC — 12 entregas K2 × 17 entregas internas

Fonte estruturada: docs/poc/README.md, backlog.json, entregas individuais e GAPS-JORNADAS.md.

As duas numerações não são somadas. Todos os aceites permanecem pendentes de demonstração integral.

## POC-01 — Preparar homologação, governança e reversão

Marco: M1. Relação K2: E12. Dependências: nenhuma.

Responsáveis técnicos desta rodada: root, pilares_interface. Não substituem aceite nominal de produto/operação.

- [ ] Registrar empresa piloto, responsáveis por produto/técnica/operação e métricas-alvo; começar com uma empresa e dados de teste.
- [ ] Definir quem executa e quem aprova arquitetura, homologação e eventual implantação; o PDF de jornadas não autoriza contratação da K2 nem muda a construção interna de D-021.
- [ ] Preparar runbook para equipe interna localizar casos/falhas e repetir o ensaio; definir acesso e responsabilidade pelo reprocessamento seguro.
- [ ] Conferir proteção de main/tags e documentar checks e revisões exigidos; tratar configuração como ação própria desta issue, sem alterar regras durante a publicação do roadmap.
- [ ] Homologação usa banco, domínio, segredos e flags próprios; habilitação do canal é explícita.
- [ ] Documentar e ensaiar backup/restauração e rollback da aplicação no ambiente realmente usado (systemd, conforme runbook atual).
- [ ] Comprovar health check, autenticação, migrações compatíveis e evidência anexada antes de cada promoção.

## POC-02 — Provar identidade, isolamento e reentrega segura na API e no banco

Marco: M1. Relação K2: E2. Dependências: POC-01.

Responsáveis técnicos desta rodada: root. Não substituem aceite nominal de produto/operação.

- [ ] Testar na API e em MySQL/MariaDB real número desconhecido, suspenso, sem vínculo e vínculo ambíguo; nenhum pode criar despesa/jornada indevida.
- [ ] Derivar contexto empresarial do vínculo autenticado no canal; na API interna, validar o contexto antes de leituras e efeitos, inclusive nas respostas idempotentes.
- [ ] Reentregar o mesmo messageId com outro contexto não revela IDs, arquivos ou resultados da empresa original.
- [ ] Provar que analista/aprovador e administrador permitido acessam somente a fila autorizada; delegação exige motivo e trilha.
- [ ] Testar restrições compostas, concorrência, reserva falha, recuperação após reinício e ausência de duplicação de efeitos.

## POC-03 — Configurar política, responsáveis, tarifa e modos por empresa

Marco: M1. Relação K2: E1, E2, E3. Dependências: POC-02.

Responsáveis técnicos desta rodada: pilares_cadastro, pilares_integridade, root, pilares_interface. Não substituem aceite nominal de produto/operação.

- [ ] Administrador edita parâmetros e designados da própria empresa com histórico de quem/quando/antes/depois.
- [ ] Política completa e atualizada é premissa do piloto; extração estruturada é validada por humano e rastreável ao documento/versão.
- [ ] Empresa sem configuração opera em sombra: registra a avaliação sem aplicar status ou comunicar decisão automática; confirmações operacionais são tratadas separadamente.
- [ ] Assistido exige confirmação humana; autônomo aplica somente o veredito autorizado pela política e pela configuração.
- [ ] Promoção/reversão de modo é humana e auditada; mesma entrada gera mesmo veredito nos três modos.
- [ ] Tarifa e regra de trajeto comercial são versionadas; cálculo monetário tem arredondamento definido e não usa defaults ocultos.

## POC-04 — Ativar equipe pelo WhatsApp e classificar interno/externo

Marco: M1. Relação K2: E5, E10. Dependências: POC-02, POC-03.

Responsáveis técnicos desta rodada: pilares_cadastro, pilares_integridade, root. Não substituem aceite nominal de produto/operação.

- [ ] Planilha é pré-validada e resumida sem gravar ou enviar convites; telefone/matrícula inválidos ou duplicados são apontados por linha.
- [ ] Confirmação explícita do administrador autoriza gravação e convites; superiores e vínculos ficam na empresa correta.
- [ ] Classificar atuação interno/externo sem transformar a classificação em autorização automática: os direitos vêm da política, inclusive deslocamentos eventuais de internos.
- [ ] Onboarding identifica número, convite, pessoa e empresa antes de aceitar operações; testes do envio real dependem de POC-06.
- [ ] Entregar texto de ativação, orientação para nota de combustível no CNPJ do empregador e roteiro/animação curta de check-in, visitas e retorno.
- [ ] Solicitar veículo e informações de campo apenas para quem necessita desse fluxo; critérios de acesso e retenção de localização são definidos antes da coleta real.

## POC-05 — Unificar veículo e consumo declarado do colaborador

Marco: M1. Relação K2: E4. Dependências: POC-02.

Responsáveis técnicos desta rodada: root, pilares_interface. Não substituem aceite nominal de produto/operação.

- [ ] Disponibilizar cadastro único com placa, RENAVAM, motorização, UF de licenciamento e km/L declarado, vinculado à pessoa/empresa.
- [ ] Impedir duplicação da mesma placa para a mesma pessoa e associações entre empresas.
- [ ] Suportar escolha do veículo na jornada e alteração auditada; histórico não muda quando o cadastro é atualizado.
- [ ] Consumo ausente/inválido gera pendência visível; não estimar litros com um valor inventado.
- [ ] Testar o indicador de divergência de consumo já previsto no motor e confirmar sua aplicação no fluxo integrado.

## POC-06 — Conectar 360dialog à inbox/outbox e desativar caminhos legados

Marco: M2. Relação K2: E10. Dependências: POC-02.

Responsáveis técnicos desta rodada: pilares_integridade, root. Não substituem aceite nominal de produto/operação.

- [ ] Usar exclusivamente 360dialog para entrada/saída da POC; preservar interface entre canal e negócio.
- [ ] Confirmar recebimento válido somente depois de persistência durável; falha de gravação não pode virar sucesso com evento perdido.
- [ ] Worker processa inbox/outbox com concorrência controlada, retentativas limitadas, recuperação de trabalhos interrompidos e falha definitiva observável.
- [ ] Normalizar texto, mídia, localização e status; baixar mídia com credencial de servidor e validar limites antes de consumo excessivo de memória.
- [ ] Ausência de credencial/configuração mantém o canal fechado; remover padrão Evolution e impedir processamento paralelo dos webhooks legados no ambiente da POC.
- [ ] Registrar ID de mensagem/entrega e tratar retorno incerto do provedor sem prometer exactly-once externo; testar reentrega sem duplicar efeitos locais.
- [ ] Homologar número, webhook e templates necessários; segredos permanecem no ambiente.

## POC-07 — Homologar comprovantes integrados e conectar OCR existente

Marco: M2. Relação K2: E10. Dependências: POC-02, POC-06.

Responsáveis técnicos desta rodada: pilares_integridade, root. Não substituem aceite nominal de produto/operação.

- [ ] Confirmar montagem da rota no serviço autenticado e conectar download da 360dialog ao recebedor persistente.
- [ ] Testar ponta a ponta foto/PDF válido, conteúdo incompatível, nome/tamanho inválido e telefone sem vínculo.
- [ ] Demonstrar concorrência, reentrega após falha e recuperação sem duplicar despesas ou deixar reservas eternas em processamento.
- [ ] Comprovar autoria/origem WhatsApp, vínculos da nota/despesa e acesso autorizado ao arquivo privado.
- [ ] Reutilizar OCR já existente; registrar resultado/proveniência e encaminhar evidência ilegível para revisão sem fabricar campos.
- [ ] Definir documentos/campos do piloto e avaliar extração com amostra controlada; apresentar confiança por campo ou indisponibilidade explícita, sem inventar pontuações. Critério de qualidade e mecanismo de confiança precisam ser homologados.
- [ ] Exercitar migração 0014 e reversão operacional compatível com a aplicação anterior em banco de teste.

## POC-08 — Concluir conversa, pendências de evidência e retorno da decisão

Marco: M2. Relação K2: E2, E10. Dependências: POC-03, POC-04, POC-06, POC-07, POC-17.

Responsáveis técnicos desta rodada: root, pilares_integridade. Não substituem aceite nominal de produto/operação.

- [ ] Persistir estado da conversa e correlação com a evidência; cobrir mensagens fora de ordem, fora de contexto, expiração e reinício.
- [ ] Usar o mesmo decisor determinístico da web; regra, versão e autoria acompanham o resultado.
- [ ] Revisão humana grava decisão e intenção de notificação atomicamente; callback interno, se usado, é autenticado, idempotente e auditável.
- [ ] Respeitar o modo da empresa: comunicação de decisão automática não ocorre em sombra; confirmação humana governa assistido.
- [ ] Comprovar recebimento → revisão → retorno no canal oficial, com fallback operacional visível em falhas.
- [ ] Backoffice apresenta o mesmo caso do WhatsApp com documento, regra, pendência, responsável vigente e decisão; integrar o detalhe da jornada/cálculo quando POC-10 estiver disponível. Colaborador conclui o caso sem abrir outra interface.
- [ ] Solicitação de nova evidência não altera fatos extraídos; não introduzir preenchimento manual de valores fiscais pela conversa.
- [ ] Separar decisão de reembolso de confirmação de crédito fiscal; auditar a atualização acoplada hoje existente em revisao.decidir antes de automatizar.

## POC-09 — Registrar check-in, checkpoints e check-out com jornada persistente

Marco: M3. Relação K2: E11. Dependências: POC-02, POC-04, POC-06.

Responsáveis técnicos desta rodada: pilares_cadastro, pilares_interface. Não substituem aceite nominal de produto/operação.

- [ ] Criar contrato de jornada e eventos check_in/checkpoint/check_out, com ID externo único, contexto autorizado e correlação com mensagens.
- [ ] Guardar coordenadas e timestamp informado pelo provedor separados de recebidoEm; horário de captura GPS e precisão são opcionais, apenas quando disponíveis.
- [ ] Definir associação entre comando e localização; não adivinhar o tipo de evento de uma coordenada sem contexto.
- [ ] Tratar duplicação, eventos atrasados/fora de ordem, checkout sem entrada, jornada atravessando meia-noite/fuso e falta de fechamento.
- [ ] Preservar eventos originais e corrigir por registros auditados; não chamar Maps nem gerar pagamento durante a captura.
- [ ] Registrar ciência e regras de acesso/retenção aprovadas para localização; coletar pontos enviados conscientemente, sem presumir rastreamento contínuo.
- [ ] Apresentar confirmação e pendências conhecidas; não afirmar detectar toda visita omitida sem referência externa.

## POC-10 — Consolidar jornadas posteriormente com Google Maps

Marco: M3. Relação K2: E11. Dependências: POC-03, POC-05, POC-09.

Responsáveis técnicos desta rodada: pilares_cadastro, pilares_interface. Não substituem aceite nominal de produto/operação.

- [ ] Definir serviço de rotas Google, orçamento, limites e credencial; verificar condições atuais de armazenamento/exibição antes de persistir respostas do provedor.
- [ ] Calcular trechos na ordem dos eventos sem otimizar/reordenar visitas; segmentar quando necessário e conservar a relação com os pontos originais.
- [ ] Job posterior ao fechamento usa chave de cálculo/versionamento para evitar cobranças e somas duplicadas; falha fica aguardando_calculo.
- [ ] Registrar método, pontos usados, versão, instante, status e somente os resultados permitidos; recalcular cria nova versão sem substituir eventos originais.
- [ ] Separar km comerciais e não comerciais pela política; valor de reembolso usa a tarifa vigente e arredondamento aprovado.
- [ ] Exibir distância como estimativa entre pontos, não como prova de caminho efetivamente percorrido; gaps conhecidos ficam pendentes de conferência.
- [ ] Não inventar trechos faltantes nem liberar valor automaticamente quando a evidência é insuficiente.

## POC-11 — Receber notas de combustível no CNPJ do empregador

Marco: M4. Relação K2: E7. Dependências: POC-02, POC-05, POC-07.

Responsáveis técnicos desta rodada: pilares_integridade. Não substituem aceite nominal de produto/operação.

- [ ] Receber XML/foto/PDF e extrair chave de acesso, CNPJ destinatário/emitente, data, itens de combustível, litros e valores.
- [ ] Validar a chave de 44 dígitos e o documento; chave ausente/malformada gera pendência, sem perder o envio.
- [ ] Conferir CNPJ destinatário contra o empregador autorizado; documento sem destinatário ou divergente não é classificado como regular.
- [ ] Guardar documento original/hash e proveniência da extração com acesso restrito; associação ao veículo/abastecimento é explícita.
- [ ] Separar combustível para análise fiscal de reembolso por quilometragem e de recibos de pedágio/estacionamento.
- [ ] Documento no CNPJ não implica crédito aproveitável: apuração permanece no motor fiscal com regras próprias e revisão responsável.

## POC-12 — Validar notas e detectar duplicidade e inconsistência documental

Marco: M4. Relação K2: E8, E9. Dependências: POC-11.

Responsáveis técnicos desta rodada: pilares_integridade. Não substituem aceite nominal de produto/operação.

- [ ] Identificar empresa, responsável fiscal, amostra e ambiente autorizado; antes de qualquer envio, aprovar o uso de dados reais, certificado e eventuais custos. Segredos não vão para Git, logs ou chat.
- [ ] Comprovar XML completo e campos necessários: chave, emitente/destinatário, data, itens, quantidades, unidades e valores; testar cancelamentos e alterações notificadas.
- [ ] Verificar certificado aceito, custódia, expiração/revogação e isolamento por CNPJ; documentar o efeito das manifestações e exigir autorização própria, sem derivá-la da aprovação de reembolso.
- [ ] Testar notificações/consultas, repetição de eventos, indisponibilidade e recuperação sem duplicar notas; conservar origem, horário da consulta e vínculo entre documento e evento.
- [ ] Demonstrar como os dados alimentam POC-13 e regularizam POC-14. CNPJ sozinho não associa nota a vendedor/veículo/jornada; manter vínculo operacional e revisão de ambiguidades.
- [ ] Confirmar custo da captura total do CNPJ, não apenas combustível: franquia, excedentes, histórico, suporte, orçamento do piloto e condições contratuais para uso no nosso sistema com múltiplos clientes.
- [ ] Registrar evidências, limitações e recomendação de seguir ou não com Focus; avaliar NFE.io se Focus não atender. Fechar o recorte E8 antes do aceite final, sem considerar o teste isolado como homologação de toda esta entrega.
- [ ] Resolver formalmente a divergência SEFAZ/E8. Se consulta ficar para depois, registrar aceite do recorte e limitar a POC à conferência documental, integridade e conciliação, sem alegar consulta fiscal externa.
- [ ] Caso consulta permaneça no aceite, verificar viabilidade/cobertura e credenciais para tipos/UFs do piloto; definir retenção e evidência da consulta.
- [ ] Quando houver consulta: inexistente/cancelada vai à revisão; indisponível/não consultável é estado explícito e não aprovação/reprovação implícita.
- [ ] Detectar duplicidade por chave fiscal/hash, inclusive com outro messageId, antes de contabilizar o documento ou gerar despesa duplicada.
- [ ] Sinalizar pares semelhantes por emitente/data/itens/valor e possíveis manipulações para revisão; medir falsos positivos em amostra rotulada.
- [ ] Definir ameaça-alvo, documentos genuínos/manipulados, conjunto de teste reservado e metas de detecção e falsos positivos; apresentar confiança/limites, nunca acusação automática de fraude. Medir também falsos negativos da amostra.
- [ ] Não adicionar banco vetorial por padrão; justificar tecnologia e custo quando a avaliação demonstrar necessidade.
- [ ] Registrar critério de aceite para manipulação documental previsto em E9; se a solução for reduzida, obter aceite explícito do recorte antes de declarar E9 cumprida.

## POC-13 — Conciliar jornada, quilômetros, veículo e notas por período

Marco: M4. Relação K2: E4, E11. Dependências: POC-03, POC-05, POC-10, POC-11, POC-12.

Responsáveis técnicos desta rodada: root, pilares_interface, pilares_cadastro. Não substituem aceite nominal de produto/operação.

- [ ] Consolidar por empresa, colaborador, veículo e período, com links para jornadas e documentos de origem.
- [ ] Somar distâncias comerciais uma vez e calcular consumo esperado somente quando o km/L usado está disponível e versionado.
- [ ] Permitir um abastecimento cobrir várias jornadas; alocar litros/documentos sem dupla contagem entre períodos.
- [ ] Considerar estoque de tanque desconhecido, abastecimentos fora da janela, uso não comercial e troca de veículo como limitações explícitas; litros comprados não equivalem automaticamente a litros consumidos.
- [ ] Produzir estados conciliado, documentacao_pendente, divergencia e revisao com motivo e histórico, sem acusação automática de fraude.
- [ ] Reembolso por km mantém sua decisão e política; situação documental/fiscal tem estado separado e não garante crédito tributário.
- [ ] Reprocessamento e nota tardia geram nova versão do consolidado; testar duplicação, ausência de checkout e período incompleto.

## POC-14 — Cobrar notas pendentes pelo WhatsApp e encerrar lembretes ao regularizar

Marco: M4. Relação K2: E10. Dependências: POC-06, POC-08, POC-13.

Responsáveis técnicos desta rodada: pilares_integridade, root. Não substituem aceite nominal de produto/operação.

- [ ] Gerar cobrança a partir de pendência real do período, e não a cada checkout nem por igualdade rígida de litros.
- [ ] Mensagem identifica período, documentação pedida e CNPJ do empregador autorizado; informa como enviar a nota pela conversa.
- [ ] Periodicidade, prazo, limite de lembretes e escalonamento para gestor são configurados por empresa e auditados.
- [ ] Respeitar janela/templates homologados; outbox, chave por pendência/etapa e verificação antes do envio impedem cobranças repetidas ou já resolvidas.
- [ ] Recebimento atualiza pendência para em_validacao; validação/conciliação regulariza e interrompe lembretes; rejeição motivada permite orientação correta.
- [ ] Falha do provedor e suspensão/desligamento têm tratamento explícito; não enviar cobrança para número sem vínculo atual.
- [ ] Falta de nota mantém documentação pendente; bloquear reembolso apenas se houver regra empresarial explicitamente validada, versionada e comunicada.

## POC-15 — Medir o piloto e registrar pagamento com autoria

Marco: M5. Relação K2: E6. Dependências: POC-03, POC-08.

Responsáveis técnicos desta rodada: pilares_cadastro, pilares_interface. Não substituem aceite nominal de produto/operação.

- [ ] Definir a régua e instrumentar eventos desde as primeiras entregas: convidados/ativados/usuários ativos, tempo envio–decisão–pagamento, revisão, confiança e precisão por amostra.
- [ ] Adicionar indicadores de jornada incompleta, km estimados, cobertura de notas, divergências e cobranças resolvidas conforme POC-09 a POC-14 integrarem.
- [ ] Registrar pagamento como ato autorizado com data/responsável; aprovada nunca vira paga sozinha, sem integração PIX nesta entrega.
- [ ] Auditoria amostral mede acertos/falsos positivos sem mudar status ou valor da despesa.
- [ ] Medir OCR por campo e detecção de manipulação no conjunto de teste acordado em POC-07/12, incluindo falsos negativos e limites da amostra; metas são pactuadas antes do aceite, sem confundir confiança declarada com precisão medida.
- [ ] Relatórios filtram empresa/período e explicitam denominadores e casos sem dados; metas numéricas ficam acordadas com a empresa piloto.
- [ ] Confrontar no aceite as cinco dimensões da régua original; resolver sua enumeração se a documentação estiver incompleta.

## POC-16 — Executar aceite ponta a ponta e preparar release da POC completa

Marco: M5. Relação K2: E12. Dependências: POC-01, POC-02, POC-03, POC-04, POC-05, POC-06, POC-07, POC-08, POC-09, POC-10, POC-11, POC-12, POC-13, POC-14, POC-15, POC-17.

Responsáveis técnicos desta rodada: root, pilares_interface. Não substituem aceite nominal de produto/operação.

- [ ] Executar empresa/política → equipe/veículo → 360dialog → comprovante → decisão/revisão/retorno e recibos de pedágio/estacionamento.
- [ ] Executar saída → visitas → retorno → cálculo posterior Maps → km comerciais → conciliação → cobrança de nota no CNPJ → validação → regularização.
- [ ] Cobrir nota ausente/divergente, mesmo documento em outra mensagem, eventos duplicados/atrasados, reinício de worker, falhas Maps/360dialog e tentativa entre empresas; incluir falha de consulta fiscal se ela permanecer no escopo decidido em POC-12.
- [ ] Demonstrar veredito idêntico nos três modos em ambiente controlado; promover sombra→assistido e reverter. Uso autônomo real requer aceite próprio.
- [ ] Apresentar métricas, amostra auditada, limitações conhecidas e nenhum defeito bloqueante aberto.
- [ ] Registrar revisão adicional e aceite de produto, sem transformar ressalvas de escopo em entregas concluídas.
- [ ] Preparar changelog, tag/artefato aprovado, backup, procedimento real de deploy, health check e rollback; ativação produtiva só após autorização prevista na política de release.
- [ ] Demonstrar trajeto elegível aprovado automaticamente a partir de cargos/responsabilidades/regras extraídos e validados da política; caso ambíguo vai à revisão, mantendo trilha.
- [ ] Executar o mesmo caso nas jornadas B2B/B2C: colaborador conclui somente pelo WhatsApp, empresa acompanha detalhe e exceções no backoffice; trilha correlaciona mensagem, tenant, pessoa, pontos, documento, política, cálculo e decisão.
- [ ] Demonstrar campos e confiança do OCR e sinais de manipulação com documentos controlados; mídia suspeita vai à revisão sem acusação automática de fraude.
- [ ] Operador autorizado localiza e reprocessa falha pela correlação sem duplicar efeitos ou expor outra empresa; nenhum segredo aparece em logs, telas ou exportações.
- [ ] Equipe interna repete o roteiro sem dependência obrigatória da K2 e recebe runbook e pacote mínimo de evidências de teste; isto não exige construir um produto de dossiê fiscal completo.
- [ ] Registrar decisão sobre SEFAZ/E8 e os demais limites em [GAPS-JORNADAS](../GAPS-JORNADAS.md); não confundir aceite de homologação com autorização de produção ou SLA.

## POC-17 — Extrair da política cargos, responsabilidades e condições de aprovação

Marco: M1. Relação K2: E2, E3, E5. Dependências: POC-02, POC-03, POC-04.

Responsáveis técnicos desta rodada: root, pilares_cadastro, pilares_interface. Não substituem aceite nominal de produto/operação.

- [ ] Extrair da política cargos/perfis, responsabilidades, despesas elegíveis, condições de trajeto, limites, etapas e autorização para automação; cada regra cita trecho e versão.
- [ ] Apresentar interpretação estruturada ao responsável da empresa para validação; regra ambígua, incompleta ou contraditória impede ativação daquela automação.
- [ ] Vincular perfis normativos às pessoas reais do cadastro; não inventar organograma nem conceder acesso porque a IA inferiu um cargo.
- [ ] Testar trajeto consolidado + perfil elegível + regra explícita + evidências suficientes: o decisor aprova automaticamente quando o modo vigente autoriza aplicar o resultado; sombra e assistido mantêm seus efeitos próprios.
- [ ] Validar exemplos reais da empresa: despesa do vendedor, do próprio gestor e de pessoa interna em atividade externa; confirmar condições por equipe, categoria e valor sem inventar tetos.
- [ ] Distinguir acesso ao sistema, cargo/área, atuação interna/externa, vínculo contratual e papel na aprovação; nenhum campo implica permissão por convenção textual.
- [ ] Modelar superior/equipe/centro de custo e responsáveis aplicáveis com vínculos da mesma empresa, sem ciclos, autoria e vigência.
- [ ] Ler da política se conferência/aprovação humana são necessárias naquele caso; fluxo elegível à automação não recebe etapa humana obrigatória por padrão.
- [ ] Definir alçadas e ordem de encaminhamento pela política validada; cargo ou nivelAprovacao isolado não autoriza despesa.
- [ ] Estabelecer substituição/delegação autorizada com escopo, início/fim e motivo, revogação e tratamento de desligamento; justificativa registra um ato, não concede poder.
- [ ] Impedir que uma pessoa decida sobre a própria solicitação fora do fluxo autorizado e definir fallback para conflitos; aprovação automática do motor, baseada na política, é um caso distinto.
- [ ] Associar despesa ao solicitante por ID empresarial estável, preservando históricos; nome livre não serve de base para roteamento/autoaprovação.
- [ ] Suspensão/desligamento revoga poderes operacionais de decisão imediatamente sem apagar trilha; testes de sessão ativa e designação antiga devem comprovar a regra.
- [ ] Testar API e banco com duas equipes, gestor substituto, teto limítrofe, conflito de interesse e tentativa entre empresas; mostrar no painel etapa/responsável/motivo.
- [ ] Registrar o fluxo aprovado por produto antes de alterar runtime. O desenho proposto é hipótese de modelagem até esse aceite.

## Extensões explicitadas

### Hierarquia extraída da política

Cargos, responsabilidades, alçadas e automação vêm de trecho e versão da política; vínculo com pessoas reais, substituição, desligamento e conflito de interesse precisam de prova. Referências: POC-17, D-024.

### Combustível por período

Nota no CNPJ do empregador, jornada, veículo, quilômetros e conciliação por período; abastecimento pode cobrir vários dias. Referências: POC-11, POC-13, D-023.

### Cobrança e regularização documental

Solicitar notas pendentes via WhatsApp, controlar prazo/frequência e encerrar lembretes após regularização. Referências: POC-14, D-023.

### Mesmo caso no WhatsApp e no painel

Colaborador conclui pelo WhatsApp; empresa acompanha no backoffice com correlação de pessoa, política, documento, pontos, cálculo e decisão. Referências: POC-08, POC-16, GAPS-JORNADAS.

### Operação e transferência de conhecimento

Runbook, reprocessamento sem duplicação, evidências, backup, reversão e equipe interna repetindo o roteiro. Referências: POC-01, POC-16.

### Avaliação de integrador fiscal

D-025 prevê Focus NFe primeiro e NFE.io como alternativa; decisão de cobertura E8 precisa ficar explícita no aceite. Testar adapter não encerra E8. Referências: POC-12, D-025.

## Fora do ciclo atual

- PIX e execução financeira do pagamento
- ERP e eSocial
- Portal do contador e dossiê fiscal completo como produto
- Motor fiscal além de combustível
- Seleção de múltiplas empresas pelo mesmo telefone
- SLA e operação produtiva 24×7

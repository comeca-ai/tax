# Verificação fiscal opcional por empresa

Implementação local de 14/09/2026. Não representa deploy, ativação da NFE.io nem aceite fiscal de documento real.

Em **Empresas → Dados fiscais → Verificação fiscal**, o administrador da empresa ou da plataforma pode marcar **Verificar autenticidade fiscal da nota**. A opção nasce desligada. Leitores da empresa podem visualizar a opção; somente administradores podem alterá-la. O backend registra autor, data, versão, valor anterior e valor novo na mesma transação. Versão desatualizada retorna conflito sem sobrescrever outra alteração.

## Momento da verificação

1. O upload web extrai os campos e persiste atomicamente arquivo, checksum e chave fiscal extraída. A chave não é aceita como parâmetro arbitrário da consulta.
2. Ao processar a nova despesa, o servidor obtém a configuração da empresa e registra uma execução exclusiva por nota, com versão e consentimento usados.
3. Desligada: mantém a decisão atual, registra `desativada` e não consulta NFE.io.
4. Ligada: valida integridade e chave. Uma NF-e 55 válida segue para o adaptador NFE.io já existente, com controle persistido de orçamento. NFC-e 65 produz `nao_suportada`, sem consulta ao endpoint 55. Chave ausente/inválida, indisponibilidade, ausência de configuração operacional e resposta fiscal não conclusiva são explicitadas.
5. A consulta ocorre antes do decisor de reembolso. Falta de confirmação impede aprovação automática; negações da política permanecem. Uma NF-e autorizada não concede aprovação por si só.
6. O detalhe da despesa mostra o resultado pelo seu ID, incluindo modelo e data da consulta quando disponíveis. Chave integral, credencial e JSON/XML do fornecedor não são publicados no resultado.

Aplica-se aos endpoints `despesas.processarAutomatica` e `despesas.create`. O WhatsApp geral também executa a verificação sem exigir jornada ou veículo: persiste primeiro a nota e uma despesa provisória em revisão, confirma a reserva fiscal em transação, consulta fora dos locks e só então aplica a política e o modo sombra/assistido/autônomo. A confirmação de recebimento é independente do OCR e da consulta fiscal. Replays recuperam a finalização pendente sem repetir a consulta. A autoria automática é nula no campo de usuário, com o ID real do colaborador validado e o vínculo de canal/documento preservados. Nenhuma execução retroativa de despesas antigas é disparada ao ativar a opção.

## Configuração e orçamento

`fiscal.configuracao({empresaId})` consulta estado e permissão. `fiscal.configurar({empresaId, habilitada, versaoEsperada})` registra a preferência; não habilita ambiente nem cria orçamento.

O operador mantém os controles separados `API_NFE_IO`, `NFE_IO_ENABLED`, `NFE_IO_BUDGET_ID` e a linha de orçamento previamente autorizada em `nfe_io_orcamentos`. A opção do cliente não compra, repõe ou aumenta créditos. Credenciais não vão para o frontend. O adapter continua sem retries; timeout/crash conserva o identificador, os registros e qualquer unidade já reservada. Duas execuções concorrentes da mesma nota não fazem duas consultas. Uma consulta em processamento permanece inconclusiva até conciliação, sem retry automático.

A reserva fiscal guarda o snapshot da opção; mudar a configuração depois não reinterpreta ou apaga o histórico daquela nota. O administrador da empresa autoriza o recurso; o colaborador ativo pode submeter sua despesa sem receber poderes administrativos. Consulta manual `nfeio.consultar` continua restrita a administradores.

## Identificação do colaborador nas despesas web

O fluxo web copia nome e centro de custo quando a sessão tem exatamente um vínculo ativo na empresa. Administrador sem vínculo não é tratado como solicitante. Campos explícitos do fluxo assistido são preservados; um terceiro explicitamente informado não herda o centro de custo do remetente.

No detalhe da despesa, **Identificar ou corrigir colaborador** permite selecionar uma pessoa ativa da própria empresa e justificar a correção. Os endpoints `despesas.identificacao.opcoes` e `despesas.identificacao.corrigir` reutilizam a autorização da revisão por empresa. Só despesas pendentes/em revisão aceitam alteração. A operação confere os valores anteriores, bloqueia alteração concorrente, registra ID do colaborador, snapshots anteriores/novos, autor e justificativa na mesma transação. Não altera situação fiscal, valores ou decisão de reembolso. A alteração do cadastro de uma pessoa não reescreve snapshots de despesas antigas.

## Migração e validação

Aplicar `0021_verificacao_fiscal.sql` antes do novo código. São três tabelas aditivas: configuração, identidade documental e resultado da verificação. Nenhuma linha de orçamento é criada e nenhuma empresa é habilitada. O rollback próprio remove somente essas tabelas; exige backup antes e retorno ao código anterior. O histórico fiscal deve ser preservado no backup e o contador de orçamento/ledger manual e web NFE.io não é removido pelo rollback. As consultas WhatsApp usam fiscal_verificacoes como ledger de reserva e resultado; é obrigatório preservá-lo no backup antes do rollback.

Validação executada: migração → rollback → reaplicação em banco descartável, testes unitários de autorização/modelos/falhas/limites, testes de interface, e integração SQL com OCR/NFE.io sintéticos. A integração SQL cobre consumo durável antes da rede, consulta antes da criação da despesa, consentimento do administrador para envio do colaborador, idempotência concorrente, adulteração, resultado vinculado ao ID da despesa e correção auditada da pessoa/centro de custo. Nenhuma chamada paga foi feita por esses testes.

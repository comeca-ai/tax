# Changelog — reembolsa.ia (Tax Engine)

Todas as mudanças relevantes deste projeto são documentadas aqui.
Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
versionamento semântico (SemVer): `MAJOR.MINOR.PATCH`.

## [1.9.0] — 2026-08-27

**Estrutura da Norma PoC.** Migração puramente aditiva: nenhum arquivo em `src/`
ou `api/` muda. O código que consome estas tabelas vem em deploy separado.

### Adicionado
- **`empresas_config`** (1:1 com empresa, `UNIQUE(empresa_id)`): `cnpj`,
  `tem_vale_refeicao`, `tem_contrato_corporativo_app`, `tarifa_km` (**única, em
  R$/km** — a PoC não diferencia motorização nem UF), `analista_id` e
  `aprovador_id`
- **`veiculos_colaborador`**: veículo por colaborador com `placa`,
  `motorizacao` (`combustao|hibrido|eletrico`) e `uf_licenciamento`;
  `UNIQUE(colaborador_id, placa)`
- **`delegacoes_decisao`**: histórico auditável de quem decidiu em nome de quem,
  com `motivo` e `decidido_em`
- **`colaboradores`**: `papel_fluxo` (`solicitante|analista|aprovador`, default
  `solicitante`) e `equipe` (`interna|externa`, default `externa`) — ambas NOT
  NULL com default, sem backfill necessário
- **Isolamento multi-tenant por chave composta**: `colaboradores(empresa_id, id)`
  ganha índice e as quatro referências a colaborador
  (`empresas_config.analista_id`, `empresas_config.aprovador_id`,
  `delegacoes_decisao.decidiu_colaborador_id`,
  `delegacoes_decisao.em_nome_de_colaborador_id`) passam a ser FKs compostas
  `(empresa_id, colaborador_id)`. Antes, a config da empresa 1 aceitava analista
  da empresa 2; agora o MySQL recusa com erro 1452
- **`db/migrations/migracoes.test.ts`**: teste-guarda da migração — cruza o `.sql`
  com `db/schema.ts` e com o snapshot, e **reprova se a ordem dos statements se
  perder** (ver Migrações)
- **`db/migrations/rollback/rollback_0008.sql`**: desfaz a 0008 por inteiro.
  Fica fora do glob `db/migrations/0*.sql`, então o entrypoint não o alcança

### Migrações
- `0008_norma_poc_estrutura.sql` — aditiva, idempotente sob o `apply.ts`,
  reaplicável e reversível. Validada contra **cópia fresca do banco de
  produção**: 15/15 statements, 2ª passada sem erro fora da allowlist, rollback
  ×2 e reaplicação OK, 16/16 tabelas com contagem intacta
- **A ordem dos statements é deliberada**: o `CREATE INDEX` de
  `colaboradores(empresa_id, id)` foi movido à mão para a **primeira** posição.
  O drizzle o emite por último, mas as FKs compostas precisam dele antes —
  sem isso o MySQL devolve `ER_FK_NO_INDEX_PARENT` (1822), que **não está na
  allowlist do `apply.ts`**, e o container não sobe. Se a migração for regerada,
  mova o `CREATE INDEX` de volta para o topo

### Conhecido / pendente
- `delegacoes_decisao.despesa_id` continua **FK simples**: a linha tem três
  ponteiros e só os dois de colaborador foram amarrados por empresa. Fechar isso
  exige índice `despesas(empresa_id, id)` + FK composta — fica para a 0009,
  porque encosta em `despesas` e amplia o escopo desta migração
- O cruzamento SQL↔`schema.ts` do teste-guarda compara **nomes** de coluna, não
  tipo/`notNull`/índices; uma troca de tipo passaria verde
- Sem seed de `empresas_config` (3 empresas, 0 configs) — vem no PR do código

## [1.8.0] — 2026-08-24

**A política é a única fonte.** Não existe tolerância, não existe hierarquia
suposta: decisão automática (aprovar ou negar) só existe onde o gestor marcou,
no card da regra, um campo estruturado. Todo o resto — texto livre, ausência de
campo, empate entre regras — é lacuna, e lacuna vai para revisão humana
**nomeando o que falta** (D-013).

### Adicionado
- **Decisão automática por regra** (`decisaoAutomatica`: `nenhuma` | `aprovar` |
  `negar`, default `nenhuma`): seletor no card de edição e chip no card de
  leitura. O rótulo de cada opção declara o **alcance** dela. `aprovar` exige
  regra reembolsável com valor em reais > 0 e alcance declarado (sem categoria ou
  escopo `categoria`); `negar` exige regra vedada — sem categoria, valor em reais
  > 0 (teto geral); com categoria, escopo `categoria` e **sem** valor. Qualquer
  edição do card rebaixa a marcação que a regra deixou de sustentar, com aviso
  visível. **Nenhum prompt de LLM pede este campo e nenhum parser o preenche**:
  é a única porta para decisão automática
- **Teto de aprovação automática por categoria**
  (`aprovacaoAutomaticaPorCategoria`): de regra marcada `aprovar` com escopo
  `categoria`. Global e por categoria aplicam-se juntos — o valor precisa caber
  em todos os tetos aplicáveis
- **Lacunas da política** (`lacunas`): `conflito-vedado-permissivo` (regra vedada
  de **categoria** convivendo com regra permissiva), `so-vedado-sem-marcacao`,
  `marcacao-sem-valor` (marcada `aprovar` sem limite em reais),
  `marcacao-sem-efeito` (marcação que a derivação não consegue aplicar) e
  `lacunas-demais` (agregada, quando o corte é necessário). Cada lacuna vira
  revisão humana com frase própria — nomeando o que falta **e o que fazer** —
  exibida no resumo em "O que a política não define"
- **Exigência de nota fiscal como declaração do gestor**
  (`exigeDocumentoFiscal` na regra): checkbox "Só aceito nota fiscal ou recibo"
  no card. Substitui o match pelo id `comprovantes-nao-aceitos`, que nenhum
  prompt pedia e que a política real nunca teve
- **Regras citadas nas decisões**: `limitesCitados`,
  `aprovacaoAutomaticaAteRegraId`, `revisaoHumanaAcimaDeRegraId` e
  `negacaoAcimaDeRegraId` — todo motivo nomeia a regra que o produziu
- Bloco **"O agente decide sozinho"** no resumo da política (primeiro da lista) e
  faixa de aviso em `/app/politica` quando a política ativa não autoriza nenhuma
  aprovação automática, com botão "Revisar regras"

### Alterado
- **Fim da tolerância de 1,5×**: valor acima do limite da categoria vai
  **sempre** para revisão do gestor, nunca é negado — o número 1,5 nunca esteve
  escrito em política nenhuma. Fecha de passagem o caso da unidade `mes`, que
  negava nota única acima de 1,5×
- **Teto da categoria passa a ser o MENOR** entre as regras de escopo
  `categoria` (antes o maior): aplicam-se todas as regras, o menor teto governa
- `categoriasVedadas` só nasce de regra vedada **marcada `negar`** com escopo
  `categoria`; `categoriasExcecao` só de regra `excecao` com escopo `categoria`.
  Regra vedada não marcada não veda mais nada
- `aprovacaoAutomaticaAte` e `negacaoAcimaDe` só nascem da marcação do gestor;
  `revisaoHumanaAcimaDe` continua vindo de regra de governança `excecao` (o
  desfecho é a ausência de decisão) e passa a usar o menor valor
- `politica.get` e `politica.ativa` devolvem as regras **consolidadas**: o card
  da política ativa e o motor passam a dizer a mesma coisa
- `"outro"` sai do conjunto de tipos não fiscais do decisor — é o balde de
  incerteza do OCR de visão, e tratá-lo como não fiscal rejeitava NFC-e de
  maquininha. Tipo sem lastro fiscal com política silenciosa vira **ressalva**,
  não bloqueio

### Removido
- Regex de texto livre que autorizava aprovação automática
  (`aprovação automática` / `reembolso automático`) e regex de veículo
  (`veículo cadastrado`/`carro próprio`) — com ela, `exigeVeiculoCadastrado`
  derivado passa a `[]` (na política real já era `[]`; checkbox por regra fica
  para uma próxima leva)
- Inferência de vedação por ausência de regra reembolsável na categoria
- Match por id `comprovantes-nao-aceitos`

### Removido — cadastro de veículo
- **A tela "Veículos" saiu do produto**, junto com o item no menu, a rota
  `/app/veiculos` e o campo "Veículo vinculado" no envio de despesa. Cadastrar
  veículo nunca foi pré-requisito de nada: era uma tela a mais entre o gestor e
  a primeira despesa
- **O checklist de primeiros passos tem 3 passos** (empresa → política →
  primeira despesa). Antes ficava eternamente incompleto em quem nunca cadastrou
  veículo — e o passo pedia um cadastro que não destravava nada
- **Nenhuma despesa vai mais para revisão por falta de veículo cadastrado**: a
  exigência (`exigeVeiculoCadastrado`) deixou de existir no contrato, na
  derivação e no agente. A regex do parser heurístico que a inferia de texto
  livre ("veículo cadastrado", "veículo da empresa") também saiu — políticas que
  não passavam pelas regras extraídas ainda carregavam o valor e travavam de
  verdade. O campo desaparece na leitura das políticas já gravadas, sem migração
- O detalhe da despesa não mostra mais a linha "Veículo" (placa · km/L), nem no
  drawer nem na fila de revisão, e o memorial de uso misto não cita mais a
  tarifa/km do veículo. **km comercial e km não comercial continuam intactos** —
  são a segregação de uso misto do motor tributário (§7.4)
- **O agente de WhatsApp também parou de pedir veículo**: quem declara que roda
  com veículo próprio não recebe mais as três perguntas de placa, modelo e km/L
  — o onboarding encerra logo depois das três declarações de perfil, e nenhum
  veículo é criado por conversa. A pergunta sobre rodar a trabalho continua, é
  ela que define de quais categorias o funcionário vai pedir reembolso
- A tabela `veiculos` **continua no banco, com os dados preservados**: nenhuma
  migração destrutiva foi escrita

### Removido — Regras & Matriz vira área restrita
- **"Regras & Matriz" sumiu da navegação de quem não é admin.** A matriz de
  elegibilidade é ferramenta do time da plataforma, não do gestor que só quer
  reembolsar despesa: o item saiu do menu e o atalho "Ver linha completa na
  matriz", no cadastro de empresa, também. A tela continua igual para quem tem
  perfil admin
- **Digitar a URL não entra mais**: `/app/regras` e `/app/equipe` — que só
  escondiam o item do menu — passaram a ter guarda de perfil na rota, com volta
  silenciosa ao dashboard para quem não é admin

### Migrações
Nenhuma. Todos os campos novos vivem no JSON de `politicas_reembolso.regras` e
chegam por `default` do zod — políticas gravadas parseiam sem tocar no banco.
A migração **0007** (`notas_fiscais.tipo_documento`, `confianca_tipo`) continua
pendente de aplicação: `npm run db:migrate` → `docker compose build` →
`docker compose up -d`, nessa ordem.

### Correções da leva (QA de código e de tela)
- **Regra vedada com valor não veda mais a categoria inteira.** "Hospedagem acima
  de R$ 800 por diária não é reembolsada", marcada `negar` com escopo
  `categoria`, negava hospedagem de R$ 100 citando os R$ 800. Vedação de
  categoria passa a exigir regra vedada **sem valor**; no card, a opção de negar
  fica desabilitada com a dica do porquê e do que fazer
- **Negação global acidental.** `negacaoAcimaDe` passa a exigir valor em reais
  **maior que zero** (`valorLimite: 0` negava toda despesa da empresa); apagar a
  categoria de uma regra marcada — única das edições do card que não rebaixava —
  passa a derrubar a marcação, e agora **toda** edição do card rebaixa; o rótulo
  da opção declara o alcance ("O agente pode negar qualquer despesa acima deste
  valor" × "…todas as despesas de Hospedagem")
- **Regra vedada de sub-item deixa de travar a categoria.** A lacuna
  `conflito-vedado-permissivo` só sobe quando a regra vedada tem escopo
  `categoria`. **Divergência deliberada da spec §3.1 item 7** (decisão do dono,
  24/08 — a spec tinha um furo aí): frigobar, gorjeta e bebida alcoólica são
  declarações sobre um sub-item, não discordância sobre a categoria. Na política
  real, hospedagem (6 vedadas) e Uber (1) iam para revisão **para sempre**, sem
  gesto na tela capaz de resolver. Os textos das lacunas passam a usar
  **contagens** em vez de um par arbitrário de regras — que produzia frases
  falsas como "'Perdas de bagagem' e 'Lavanderia' não dizem qual prevalece" — e
  a dizer o que fazer para resolver
- **Marcação sem efeito deixa rastro** (lacuna `marcacao-sem-efeito`): marcar
  `aprovar` numa regra de categoria com escopo `item` (o default de tudo que o
  LLM extrai) mostrava chip verde no card e "Nada" no resumo, sem uma palavra. O
  front passa a exigir `categoria === null || escopo === "categoria"` e o
  servidor nomeia qualquer marcação que a derivação não consiga aplicar
- **A política ativa não é mais editada no lugar** (RF-07): `politica.updateRegras`
  recusa política `ativa` e a tela cria uma **cópia rascunho** (`politica.duplicar`);
  a versão em vigor continua decidindo até o "Ativar política". Textos ajustados
  para dizer a verdade ("Regras salvas no rascunho")
- **Moeda estrangeira**: o card só habilita aprovação automática com limite em
  reais, com dica própria — antes a UI habilitava e o servidor rejeitava
- **Teto de lacunas** (`LACUNAS_MAX = 60`): a derivação nunca produz mais lacunas
  do que o contrato aceita. Passava disso, o reparse estourava (`too_big`) e
  `politica.get`, `politica.ativa` e a decisão automática caíam para a empresa
  inteira. Ao cortar, a última vira `lacunas-demais` **sem categoria** — manda
  tudo para revisão, o lado seguro
- **`exigeDocumentoFiscal` por categoria** (`exigeDocumentoFiscalPorCategoria`):
  marcar "só nota fiscal" numa regra de hospedagem negava extrato em alimentação
  citando a regra de hospedagem. Exigência com categoria vale só nela; sem
  categoria, na empresa toda
- **Apagar todas as regras zera os parâmetros**: `consolidarRegras(regras,
  "edicao")` distingue "política sem regras extraídas" (demo/heurística, fica
  intocada) de "o gestor apagou as regras" — que antes mantinha o
  `aprovacaoAutomaticaAte` anterior aprovando despesas que nenhuma regra sustenta
- **`politica.desativar` passa a exigir admin da empresa** (`assertAdminDaEmpresa`):
  um revisor de qualquer empresa suspendia a avaliação automática de qualquer
  empresa
- **Tela**: o gate P-4 chega ao front (botões de decisão escondidos/desabilitados
  com o motivo visível, em vez de 403 no fim de 70 regras); aviso visível quando
  a edição rebaixa a decisão automática; dica de **cada** opção indisponível
  sempre renderizada (`select` nativo não tem tooltip no celular);
  `exigeDocumentoFiscal` entra no bloco "O agente decide sozinho"; "Teto por
  categoria" ganha estado vazio explicado em vez de sumir; rótulo visível dos 4
  campos do card no mobile e alvo de toque de 44px; contraste da faixa de aviso e
  `focus-visible` no botão dela; decisões citam a **descrição** da regra, nunca o
  id cru

### 3ª rodada de correções (QA de código e de tela)
- **A marcação só vale em regra que a sustenta — no servidor também.** `aprovar`
  passa a exigir regra `reembolsavel: "sim"` e `negar`, regra `vedado`, **na
  derivação**. O filtro existia só no caminho por categoria: a tela barrava e a
  API não. Porta de decisão automática não pode depender da tela (D-013)
- **`exigeDocumentoFiscal` obedece ao alcance da regra**: com categoria, só surte
  efeito com escopo `categoria`. "Gorjeta ao camareiro só com recibo" negava a
  diária de hotel paga por Pix citando a regra da gorjeta. Marcação que não pega
  vira lacuna `marcacao-sem-efeito` nomeando o gesto que resolve
- **O teto de aprovação nunca é maior que o teto da categoria**: "aprova até
  R$ 400" convivendo com outra regra que fixa R$ 150 mostrava chip verde de 400
  enquanto o agente parava em 150. Aplicam-se as duas, vale a menor, e o motivo
  nomeia as duas regras
- **Aprovação passa a citar a regra** (`aprovacaoCitadaPorCategoria`): era o
  único desfecho que não citava nenhuma — o gestor lia "aprovado" sem saber qual
  regra liberou
- **Rótulo de categoria igual na tela e no motor** (`CATEGORIA_DESPESA_ROTULO` =
  `CATEGORIA_META`): o motivo dizia "alimentação" e "Uber/app" enquanto o chip ao
  lado, na mesma tela, dizia "Alimentação" e "Uber"
- **Chaves de máquina traduzidas na tela** (`src/components/politica/veredito.ts`):
  `lacunaDaPolitica`, `conflito-vedado-permissivo` e afins apareciam crus no
  veredito. A trilha de auditoria continua gravando as chaves

### Removido nesta rodada
- **Simulação do agente** (decisão do dono, 24/08): a caixa "Simular o agente"
  saiu das duas telas de `/app/politica` — o "teste o agente antes de ativar" do
  passo 3 e o playground da tela de status — e `SimuladorPolitica.tsx` foi
  apagado. Nesta mesma leva o `politica.testar` havia ganhado o parâmetro
  `politicaId`, para simular o **rascunho** em vez da versão em vigor (o passo 3
  mandava "testar antes de ativar" e devolvia o veredito da política antiga); o
  procedimento continua no router, agora **sem chamador**

### Nota de operação
Políticas já ativas ficam em **100% revisão** até o gestor reeditar e marcar as
regras que autorizam o agente a aprovar sozinho — nenhuma marcação é inventada
por nós. A faixa em `/app/politica` avisa e cria a nova versão; a versão ativa
não é mais alterada no lugar, então a mudança só vale depois de "Ativar política".

## [Unreleased] — convergência da branch `feat/policy-llm-gemini` sobre a base 1.7.0 (versão definida no merge em `master`)

**Política da empresa: tudo nasce do documento.** O gestor vê o texto que o
OCR leu e ajusta as regras extraídas antes de ativar.

### Adicionado
- **Escopo da regra (`item` | `categoria`)**: o gestor marca no card
  "Vale para a categoria inteira" quais regras definem o limite geral do tipo de
  despesa; sub-itens (lavanderia, frigobar, gorjeta) ficam desmarcados. O LLM
  propõe o alcance (campo `alcance` no prompt do Mistral e do Gemini), o gestor
  confirma antes de salvar (D-013). Card de leitura ganha o chip
  "Vale para a categoria"
- **Teto por período** (`tetosTemporaisPorCategoria`): teto promovido com unidade
  `dia`/`viagem`/`evento` nunca gera negação automática — como um comprovante pode
  cobrir vários períodos, o pior desfecho é revisão do gestor. Resumo da política
  mostra "até R$ 400,00 por dia" e a nota de rodapé correspondente
- **OCR de comprovantes de despesa via Mistral**: Mistral OCR (annotation JSON)
  como primeira tentativa, OpenAI de fallback; Gemini sai da cadeia de despesas
  (o parser de política segue com ele). Sem variável nova: reaproveita
  `MISTRAL_API_KEY` e `MISTRAL_OCR_MODEL`, já lidas pelo parser de política
- **Classificação do tipo de documento** (`tipoDocumento`/`confiancaTipo`) na
  extração de visão e em `notas_fiscais` (migração 0007)
- **Negação automática de comprovante não fiscal** (extrato, Pix, cartão)
  citando a regra `comprovantes-nao-aceitos` e a versão da política, com
  orientação de reenvio; dúvida sobre o tipo cai em revisão do gestor (D-013)
- `CATEGORIA_DESPESA_ROTULO` compartilhado no contrato (agente, decisor e
  derivação passam a usar o mesmo mapa)
- `ressalvas[]` e `confianca` no retorno de `despesas.processarAutomatica` e no
  JSON do log `reembolso_decisao`; as ressalvas entram em `politicaMotivo`/
  `motivoRevisao` como linha `Ressalva: …` e aparecem no veredito do Envio rápido
  e da Nova despesa
- Fixture `politica13.fixture.ts`: espelho estrutural de uma política real de
  70 regras, usado como regressão da derivação
- **Parser de política via LLM** (provider plugável, mesmo padrão do OCR):
  `mistral` (OCR `mistral-ocr-latest` + chat `json_object`) e `gemini`
  (leitura nativa de PDF/imagem). Seleção por `POLICY_PROVIDER`
  (`heuristico` | `mistral` | `llm` = alias de mistral); falha do LLM cai no
  heurístico com aviso — o upload nunca quebra. Variáveis `MISTRAL_API_KEY`,
  `MISTRAL_MODEL`, `MISTRAL_OCR_MODEL`, `GEMINI_API_KEY`, `OCR_GEMINI_MODEL`
  passam pelo `docker-compose.yml`
- **Texto lido do documento** no passo "Revisar regras": painel lado a lado
  (desktop) / accordion (mobile) com confiança da extração, parser usado,
  avisos (inclusive páginas com problema de leitura) e o texto do OCR
- **Regras extraídas editáveis**: agrupadas por tema, com editar inline,
  remover e adicionar (com seletor de tema) antes de ativar; passo
  "Simular e ativar" mostra "Regras que serão ativadas"
- **Regras extraídas como única fonte** (`regrasExtraidas` em `RegrasPolitica`):
  o passo "Revisar regras" mostra só cards estruturados por tema (categoria,
  valor, unidade, reembolsável, comprovante); limites por categoria,
  exigências e tetos gerais são derivados no servidor (`api/modules/reembolso/policy/derivar.ts`)
  em `updateRegras`/`ativar` — teto geral só de regra de governança sem
  categoria, classificada pelo campo `reembolsavel` (vedado → negação;
  exceção → revisão humana; sim + "aprovação automática" no texto →
  aprovação automática); nada é inferido de texto livre (D-013). `updateRegras` devolve as regras consolidadas; resumo do
  passo 3 e do card "Política ativa" ganham o bloco "O que o agente vai aplicar"
- `APP_URL` no ambiente; cookie de sessão só leva `Secure` quando a URL
  pública é HTTPS
- Testes: `texto.test.ts`, `mistral.test.ts`, `observacoes.test.ts`
  (vitest passa a coletar `src/**/*.test.ts`)

### Corrigido
- **Sub-item deixou de virar teto da categoria.** O limite por categoria só nasce
  de regra marcada com `escopo: "categoria"`; regra de escopo `"item"` (o default)
  descreve um sub-item e nunca vira teto, vedação ou exceção da categoria inteira.
  Era o que negava um extrato de hotel de R$ 691,17 citando "limite de hospedagem
  R$ 30,00" — valor que vinha da regra "Lavanderia em viagens nacionais"
- **Vedação e exceção por categoria** (`categoriasVedadas`/`categoriasExcecao`,
  derivadas das regras extraídas): regra vedada com escopo de categoria veta;
  sem esse marcador, a categoria só é vedada quando não há nenhuma regra
  reembolsável nela; convivendo "vedado" e "sim", a despesa vai para revisão
  humana citando a regra — nunca negação automática. O agente ganha os passos
  `categoriaVedada` (nega e encerra) e `categoriaExcecao` (revisão humana)
- **CNPJ ausente deixou de bloquear a decisão**: vira ressalva
  ("CNPJ do emitente não identificado no comprovante — confira na evidência
  anexada.") e rebaixa a confiança de alta para média. O decisor só devolve por
  extração incompleta quando falta valor ou data (D-014: ninguém preenche nada).
  `confiancaDaNota()` passa a considerar valor + data + categoria
- `despesas.processar`, `despesas.processarAutomatica` e `politica.testar`
  consolidam as regras **na leitura**: políticas gravadas com a semântica antiga
  passam a ser aplicadas corretamente sem migração, e o simulador mostra
  exatamente o que o agente aplica
- `processarAutomatica`: "tem veículo" passa a ser "a empresa tem veículo
  cadastrado" (um `SELECT ... LIMIT 1`), e o `veiculoId` recebido só é gravado se
  pertencer à empresa — fecha um vazamento cross-tenant latente
- **Parser Gemini alinhado ao Mistral**: `mapearRuleset()` deixa de calcular
  `limitesPorCategoria` pela semântica antiga e passa a produzir `regrasExtraidas`
  + `consolidarRegras()`, como o provider Mistral
- Parser Mistral: política com dezenas de regras estourava `max_tokens` (8 000) e
  devolvia JSON cortado → caía no heurístico. Agora: teto 32 000 tokens, detecção
  de `finish_reason=length`/JSON inválido com nova tentativa compacta, prompt
  enxuto (só os campos consumidos pelo mapeador), modelo padrão
  `mistral-medium-latest` (~2× mais rápido) e timeout do chat de 240 s

### Alterado
- Parser Mistral grava o markdown integral do OCR em `texto_extraido`
  (truncado a 65 000 bytes UTF-8, sem partir caractere); o resumo da
  extração passou para os avisos. Heurístico usa o mesmo truncamento
- Resumo da política (passo "Simular e ativar" e card "Política ativa") ficou
  escaneável: cabeçalho de números (regras · reembolsáveis · exceções · vedadas
  · temas), "O que o agente vai aplicar" sobe para o topo em cards, regras
  agrupadas em accordion por tema (fechado por padrão, "Expandir/Recolher
  todos") com valor alinhado e unidade por extenso ("por dia", "%", "USD 80")

## [1.7.0] — 2026-08-14

**Motor de decisão automático: a foto entra → extrai → aprova ou nega.**
Materializa as decisões D-013 e D-014 no fluxo do produto: ninguém preenche
nada — a despesa é decidida pelo agente com base na política e nos padrões
anômalos, citando a regra aplicada.

### Adicionado
- **Módulo `decisor-reembolso`** (`api/modules/reembolso/decisor/`): função
  pura `decidirReembolso(extracao, regrasPolitica, contexto)` →
  `aprovado | negado | revisao_manual`, com motivos e regras aplicadas.
  Sem política ativa **nunca aprova** (D-013); extração incompleta vai para
  revisão manual do gestor (D-014) — 10 testes novos
- **Procedure `despesas.processarAutomatica`**: recebe a nota enviada, roda o
  decisor e grava a despesa já decidida (`aprovada`, `rejeitada` ou
  `em_revisao` com motivo), com trilha de auditoria e versão da política
  aplicada. O motor fiscal só roda quando há dados suficientes — depois e
  separado, com regras próprias (D-014)
- **OCR de visão (`VisaoOcrProvider`)**: fotos e PDFs de notas são lidos por
  IA — OpenAI (`gpt-4o-mini`) com fallback Gemini (`gemini-2.0-flash`),
  ativado com `OCR_PROVIDER=visao` + `OPENAI_API_KEY`/`GEMINI_API_KEY`.
  XML/texto continuam gratuitos (heurístico). Falha total → revisão manual,
  nunca erro para o usuário — 8 testes novos
- **`StepVeredito`**: tela de veredito com a decisão, a fundamentação
  (motivos + regras citadas + versão da política) e o resumo da extração —
  somente leitura

### Mudado
- **Nova Despesa e Envio Rápido em 2 passos**: "Enviar nota" → "Veredito".
  O formulário de preenchimento manual assistido foi **removido** — quem
  extrai e verifica é o agente
- `notas_fiscais` ganha `categoria_sugerida` e `litros` (migração 0006);
  `despesas.categoria` passa a aceitar `NULL` (decisão do agente, não do
  usuário)

## [1.6.6] — 2026-08-14

### Adicionado
- **`scripts/deploy.sh`**: deploy na VPS em um comando — fetch de tags, checkout
  (tag mais recente ou a informada), `npm ci`, migrações, build e
  `pm2 restart reembolsa` com health check no final
- **Endpoint `GET /api/health`** para health check de deploy e monitoramento

## [1.6.5] — 2026-08-14

Reorganização do código em módulos, materializando a D-014. Sem mudança de
comportamento — 72/72 testes verdes.

### Mudado (estrutura)
- **`api/modules/reembolso/`**: `agente/` (máquina de estados, processamento,
  convite-isqueiro), `policy/` (parser + avaliador), `whatsapp/` (adapter
  Evolution/Meta) — o motor que só extrai e verifica
- **`api/modules/fiscal/`**: `engine/` (regras tributárias RF-00..09), `ocr/`
  (provider plugável), `cnpj/` (ReceitaWS) — a apuração que entra depois,
  com regras próprias
- Plataforma compartilhada (auth, routers, mail, db) permanece fora dos módulos
- Mapa dos módulos em `api/modules/README.md`; paths atualizados no README e
  no ARQUITETURA.md

## [1.6.4] — 2026-08-14

Release documental — separação dos motores (D-014), validada com caso real
(cupom de hortifruti R$ 90,14 vs. política START UP SP: reprovado por
consumidor não identificado + valor acima do teto + natureza ≠ categoria).

### Adicionado (documentação)
- **D-014**: o agente de reembolso só **extrai e verifica** — contra a política
  (regra explícita) e contra **padrões anômalos** (valor fora do teto, consumidor
  não identificado, natureza incompatível, horário incoerente, duplicidade).
  **Negado é negado; ninguém preenche nada** — nem formulário web, nem campo no
  WhatsApp. O **motor fiscal entra depois, separado, com regras próprias**:
  reembolso decide se a despesa é devida ao colaborador; fiscal decide o que é
  aproveitável tributariamente — decisões e trilhas independentes

### Mudado (documentação)
- PRODUTO.md §4.3 reescrito (ciclo sem perguntas de preenchimento); regras
  normativas 9-11 (motores separados; ninguém preenche nada)
- ARQUITETURA.md: `brain/decisor` → `brain/decisor-reembolso` + `motor/fiscal`
  como módulos separados; estado `COLETANDO_DEFESA` removido da máquina;
  OCR ilegível no reembolso vira revisão manual, não pergunta

## [1.6.3] — 2026-08-13

Release documental — correção de doutrina do motor de decisão (D-013).

### Mudado (documentação)
- **D-013 registrada**: nenhum reembolso é aprovado sem regra explícita na
  política; **não existe zona cinzenta de decisão** — dúvidas materiais
  (imagem ilegível, dado inconsistente, caso sem cobertura) vão para
  **revisão manual do gestor**; o sistema **nunca sugere nem acrescenta nada**
  na política de reembolso — ela só muda por edição humana versionada
- **D-006 (política viva) revogada**; D-007 ajustada ("cinza" → revisão manual)
- PRODUTO.md: princípio 4 reescrito, §4.4 reescrita ("Revisão manual — e por
  que não existe zona cinzenta"), regras 5-6 do resumo normativo, roadmap sem
  a onda de política viva
- ARQUITETURA.md: contrato do decisor passa a `aprovada | reprovada |
  revisao_manual`; módulo `politica-viva` removido; tabela `excecoes` →
  `revisoes` (sem "virou_regra"); roadmap v1.9.0 = escala (política viva
  cancelada)

## [1.6.2] — 2026-08-13

Cadastro de empresa: sem veículo no wizard, com aceites legais.

### Adicionado
- **Caixinhas obrigatórias no cadastro da empresa**: consentimento LGPD
  (tratamento de dados conforme Lei nº 13.709/2018) e declaração de poderes
  para representar a empresa perante os órgãos legais e fiscais. Aceites
  registrados na trilha de auditoria (`empresa.create`)

### Removido
- Botão "Cadastrar veículo agora" na tela final do wizard — veículos ficam
  somente na área administrativa (Configurar → Veículos) ou via WhatsApp
  pelo próprio colaborador

## [1.6.1] — 2026-08-13

Hotfix: "Esqueci a senha" era um mock (só exibia toast). Agora é um fluxo
real de redefinição de senha, ponta a ponta.

### Adicionado
- **`auth.solicitarResetSenha`** (público): gera token com validade de 1h e
  envia link `${APP_URL}/redefinir-senha/<token>` por e-mail via SMTP. Sem
  SMTP configurado, o link vai apenas para o log do servidor — nunca para o
  cliente. Resposta é sempre uniforme (`{ok: true}`), sem vazar se o e-mail
  existe ou não
- **`auth.redefinirSenha`** (público): valida token (existe, não usado, não
  expirado), atualiza a senha, marca o token como usado (uso único) e
  registra na auditoria
- **Página `/redefinir-senha/:token`**: nova senha + confirmação (mín. 8
  caracteres), redireciona ao login após sucesso
- **Tabela `resets_senha`** (migração `0005_resets_senha.sql`)

### Corrigido
- Dialog "Esqueci a senha" do login agora chama o backend de verdade
  (antes era apenas um toast de mentira)

## [1.6.0] — 2026-08-12

Admin limpo + convites do agente (D-012: repriorização do roadmap — o motor de
decisão passa a ser a v1.7.0).

### Adicionado
- **Convite-isqueiro do colaborador** (D-004): `colaboradores.enviarConvite`
  gera o link `wa.me` do agente com mensagem pré-preenchida ("Oi! Sou Maria,
  da Empresa. Minha matrícula é 77. Quero ativar meu reembolso.") e dispara
  por e-mail quando há SMTP (`enviarConviteAgenteEmail`); sem SMTP, o admin
  copia o link. Variável nova: `AGENT_WHATSAPP_NUMBER`
- **Equipe → Colaboradores no WhatsApp**: cadastro rápido (nome, WhatsApp,
  e-mail, matrícula), lista com status de ativação (Aguardando ativar / Ativo
  no WhatsApp / Revisar dados) e botão "Enviar convite" por linha — o status
  muda sozinho quando o colaborador conclui o onboarding com o agente
- **4 testes novos** (72 no total) do helper de convite (link, mensagem,
  fallbacks de configuração)

### Melhorado
- **Navegação do admin redesenhada**: 11 itens soltos → 3 grupos com rótulo
  ("Dia a dia", "Configurar", "Fechar o mês"); "Nova Despesa" sai do menu
  (ação dentro do Dashboard); topbar sem botões mortos (Buscar ⌘K, Ajuda e
  Notificações sem função removidos)
- Tela de Equipe dividida em "Colaboradores no WhatsApp" (jornada do agente)
  e "Usuários do painel" (convites web admin/revisor/cliente)

### Documentação
- D-012 (repriorização) em `docs/DECISOES.md`; roadmap reordenado em
  `docs/ARQUITETURA.md` §8 e `docs/LINHA-DO-TEMPO.md`

## [1.5.0] — 2026-08-12

Fundação do agente de reembolso (onda 1 do redesenho — ver `docs/PRODUTO.md`
§7 e `docs/DECISOES.md`). O funcionário agora faz o onboarding inteiro pelo
WhatsApp: confirma os dados, declara o que costuma pedir e cadastra o veículo
só se precisar dele (D-001/D-005).

### Adicionado
- **Agente de onboarding conversacional** (`api/agente/`): máquina de estados
  pura e testável (saudação → confirmação de dados → 3 perguntas de perfil →
  veículo contextual → pronto), tolerante a respostas ambíguas, placas e
  números em formatos variados; divergência de dados vira exceção para o
  admin (`status_ativacao = divergencia` + log de auditoria)
- **Adapter de transporte WhatsApp** (`api/whatsapp/`): interface
  `WhatsappProvider` + provider **Evolution API** (envio via
  `POST /message/sendText/{instance}`, parsing de `messages.upsert` ignorando
  fromMe/grupos/broadcast) + seleção por `WHATSAPP_PROVIDER` (D-010). Sem
  variáveis configuradas o agente roda em modo log e o app segue 100% (D-011)
- **Webhook Evolution** `POST /api/whatsapp/webhook` com autenticação
  opcional por `WHATSAPP_WEBHOOK_SECRET` (header `x-webhook-secret`)
- **Colaboradores** (novo): tabela + router `colaboradores.criar/listar/
  atualizarStatus` — o admin cadastra quem pede reembolso (nome, telefone,
  e-mail, matrícula, centro de custo); colaborador não precisa de login
- **Sessões de conversa** (novo): tabela `sessoes_conversa` (estado +
  contexto JSON por telefone) e `declaracoes_perfil` (o que cada colaborador
  declarou pedir) — migração `0004_agente_onboarding.sql`
- **Veículo pelo WhatsApp**: ao declarar combustível, o agente coleta placa,
  modelo e consumo e cria o veículo na empresa — ninguém mais cadastra veículo
  sem precisar dele
- **22 testes novos** (68 no total): parsing de payload Evolution (texto,
  caption, fromMe, grupos, malformado), envio com URL/apikey corretos, e a
  máquina de estados completa (fluxo feliz com e sem veículo, divergência,
  respostas inválidas, estado pronto)
- Documentação: D-011 (Evolution como stack separado) em `docs/DECISOES.md`,
  seção de transporte em `docs/ARQUITETURA.md`, README atualizado

### Técnico
- Variáveis novas no `.env.example`: `WHATSAPP_PROVIDER`, `EVOLUTION_API_URL`,
  `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE`, `WHATSAPP_WEBHOOK_SECRET`
- Webhook legado da Meta (`/api/webhooks/whatsapp`) preservado para a
  migração futura (D-010)

## [1.4.6] — 2026-08-12

### Adicionado
- **`docs/PRODUTO.md`** — redesenho de produto: agente de reembolso (não plataforma
  modular), 5 princípios (campo=defesa, fim do achismo, gestão por exceção, política
  viva, interesse do funcionário como motor), atores e UX por ator, fluxos end-to-end
  (setup em lote, convite e-mail→wa.me, onboarding conversacional, ciclo da despesa,
  zona cinzenta, dossiê 1-botão), 9 regras de negócio, gap analysis e roadmap em ondas
- **`docs/ARQUITETURA.md`** — um cérebro (`brain/`), duas superfícies (web + agent
  WhatsApp magro), contrato central do decisor (sempre com regra citada), máquina de
  estados da conversa, modelo de dados novo (hierarquia, sessões, exceções, versões
  de política), deploy em 3 containers na VPS e releases v1.5.0–v1.9.0
- **`docs/DECISOES.md`** — registro ADR com 10 decisões (D-001 a D-010), incluindo:
  agente-first, onboarding progressivo self-service, gestão por exceção com escalada
  de um degrau, política viva sem caixa-preta, dossiê de recuperação sem entrar na
  parte fiscal, Evolution API como transporte WhatsApp da largada atrás de adapter
  `WHATSAPP_PROVIDER` (migração futura à API oficial sem mudar o produto), e tudo
  self-hosted na VPS (sem Railway)
- **`docs/LINHA-DO-TEMPO.md`** — passado/presente/futuro do projeto em um arquivo,
  com checklist de pendências operacionais

### Corrigido
- Comentário do teste do parser de política: fixture descrito corretamente como
  "documento fictício" (era "PDF real")

## [1.4.5] — 2026-08-11

### Adicionado
- **`docs/DEPLOY.md`** — runbook público de deploy: modelo de atualização por
  tag (fetch → checkout → `up -d --build` → health → rollback), diferença
  entre atualização de código e de higiene, checklist de máquina nova e
  regras de ouro (migrações automáticas, override referencia `tax-app`,
  segredos só no `.env`)

### Corrigido
- **`.gitignore`**: adicionados `docker-compose.override.yml`, `proxy/` e
  `uploads/` — artefatos por máquina e topologia de infra não podem vazar
  para o repositório (público)

## [1.4.4] — 2026-08-11

### Corrigido
- **Lockfile com 3 URLs de mirror privado** (`node-ensure`, `pdf-parse`,
  `debug` — vazaram do ambiente de build no bump do pdf-parse em 1.4.3):
  normalizadas para `registry.npmjs.org`; `.npmrc` versionado fixando o
  registry público para impedir reincidência em qualquer ambiente

## [1.4.3] — 2026-08-11

### Corrigido
- **Upload da política não extraía os valores do PDF** (reportado por usuário
  em produção): o parser heurístico tratava todo PDF como binário. Agora
  extrai a camada de texto do PDF (pdf-parse) e interpreta tabelas de tetos
  que quebram células em várias linhas (janela de até 3 linhas que para antes
  da próxima categoria — sem contaminação):
  - Tetos por categoria extraídos do documento real (ex.: Almoço R$ 55 →
    `alimentacao`; Hospedagem R$ 450 → `hospedagem`)
  - Tarifa por km (R$ 1,30/km) vai para observações — **nunca** vira teto de
    `combustivel`
  - Variações regionais e subtipos (jantar, refeição com cliente) viram
    observações para revisão, sem sobrescrever o teto principal
  - Exigências (nota fiscal discriminada, veículo próprio) associadas à
    categoria correta via janela retroativa
  - Keywords de alimentação ampliadas (almoço, jantar, pernoite)
- PDF escaneado (só imagem) continua caindo no preenchimento assistido, com
  aviso claro

### Adicionado
- 8 testes do parser com o PDF real da política como fixture
  (`api/policy/parser.test.ts` + `__fixtures__/`) — suíte sobe para 46 testes

## [1.4.2] — 2026-08-11

### Corrigido
- **Upload de nota/cupom falhava e expunha SQL ao usuário** (reportado por
  usuário em produção): fotos/PDFs acima de ~64 KB estouravam a coluna
  `arquivo_base64` (MySQL `TEXT`); migrada para `MEDIUMTEXT` (até 16 MB) em
  `notas_fiscais` e `evidencias_documentais`, limite de 10 MB validado na
  entrada com mensagem clara, e falhas de persistência agora retornam
  mensagem amigável em PT-BR sem vazar query/parâmetros
- **App inutilizável no celular**: a sidebar fixa de 264 px cobria o conteúdo
  em telas pequenas. Agora vira drawer (hambúrguer) com backdrop, fecha ao
  navegar e trava o scroll de fundo; topbar, banner RF-00, conteúdo e rodapé
  com paddings responsivos; seletor de empresa trunca sem estourar a largura
  — overflow horizontal zerado, validado em viewport de 390 px

## [1.4.1] — 2026-08-09

### Adicionado
- **One-pager "A Tese" em PDF para download** — versão A4 de página única da
  página `/tese` (mesma copy e identidade visual), servida em
  `public/one-pager-tese.pdf`; botão "Baixar one-pager em PDF" no hero da
  página A Tese (download direto, sem cadastro)

## [1.4.0] — 2026-08-09

### Adicionado
- **Página pública "A Tese" (`/tese`)** — defesa das decisões de produto como
  argumento comercial e de conformidade:
  - A tese em números (9,25% PIS/COFINS · ICMS ad rem · 34% IRPJ+CSLL)
  - As 4 glosas que a Receita faz → as 4 defesas do produto (evidência RF-04,
    matriz CNAE + segregação §7.4, plausibilidade de veículo RF-09, memorial +
    versionamento RF-07 + log imutável)
  - "O que o reembolsa.ia nunca faz" (4 garantias)
  - Seção "Para o seu contador" (metodologia + referências legais) com
    disclaimer de aconselhamento tributário
  - Link no Navbar e no Footer
- **Explicações contextuais no app** (reduz atrito, justifica o "porquê"):
  - Banner dismissível em Veículos (plausibilidade do crédito de combustível)
  - Linha de defesa na caixa de evidência obrigatória (drawer da despesa)
  - Nota sobre segregação uso misto nos campos de km do wizard

## [1.3.0] — 2026-08-09

### Adicionado
- **Consulta de CNPJ na Receita Federal (ReceitaWS)** com preenchimento
  automático do cadastro de empresa:
  - Botão **"Buscar na Receita"** ao lado do campo CNPJ — na página de Empresas
    (criar/editar) e no wizard de cadastro (signup, funciona sem login)
  - Preenche razão social, CNAE principal, CNAEs secundários e UF — tudo
    continua editável após o prefill
  - CNAE completo da Receita (`64.22-1-00`) normalizado para o formato curto
    do app (`64.22-1`); CNAEs fora da lista curada entram no combobox com
    código + descrição vindos da API
  - Aviso âmbar persistente quando a situação cadastral não é ATIVA
  - Endpoint server-side `empresas.consultarCnpj` (público) com timeout 10s,
    validação de checksum do CNPJ e mensagens PT-BR para 429 (plano gratuito:
    3 consultas/min), CNPJ inválido e não encontrado
  - Token via `RECEITAWS_TOKEN` no `.env` (opcional — sem ela o botão avisa
    que a consulta não está configurada); repassada pelo docker-compose
  - Testes: +12 (38/38 no total); smoke test ao vivo do endpoint

## [1.2.3] — 2026-08-09

### Corrigido
- **docker-compose.yml**: serviço `app` renomeado para `tax-app` em rede
  dedicada `tax-net` — evita colisão de alias de rede quando o stack divide
  uma rede de proxy reverso (Caddy/Traefik) com outro projeto que também tem
  serviço `app` (o alias resolvia para os dois containers em round-robin e os
  domínios serviam o site um do outro). README ganhou a orientação de
  `reverse_proxy tax-app:3000` no Caddyfile

## [1.2.2] — 2026-08-09

### Corrigido
- **Página sem CSS após deploy (self-host)**: `index.html` agora é servido com
  `Cache-Control: no-cache` e os assets com hash (`/assets/*`) com
  `max-age=31536000, immutable` — antes, browser/proxy cacheavam o HTML antigo
  que apontava para assets inexistentes (site todo desestilizado, variando por
  navegador conforme o cache local; também quebrava o layout mobile)
- **Dockerfile**: `npm ci --include=dev` nos dois estágios — com
  `NODE_ENV=production` o npm pulava devDependencies e o entrypoint não
  encontrava `tsx`/`drizzle-kit` (nem o `vite` no build)
- **package-lock.json**: 263 URLs `resolved` normalizadas de mirrors
  (`npm.mirrors.msh.team`, `registry.npmmirror.com`) para `registry.npmjs.org`
  — o lock gerado no ambiente de build apontava para registry privado e o
  `npm ci` falhava silenciosamente no VPS (exit 0 com `vite: not found`)
- **.dockerignore**: excluídos `.env`, `uploads/` e `docker-compose.override.yml`
  do contexto de build (segredos fora da imagem)

## [1.2.1] — 2026-08-09

### Corrigido
- **docker-compose.yml** agora repassa ao container as variáveis opcionais da
  v1.2.0: `APP_URL` (sem ela, os links de convite saíam como
  `http://localhost:3000` no container), `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/
  `SMTP_PASS`/`SMTP_FROM` (convites por e-mail) e `WHATSAPP_VERIFY_TOKEN`
  (webhook WhatsApp). Todas com default seguro — basta preencher no `.env`

## [1.2.0] — 2026-08-09

### Adicionado
- **Primeiro usuário = admin + convites por e-mail**:
  - O primeiro cadastro da plataforma (banco vazio) vira `admin` automaticamente;
    cadastros seguintes entram como `cliente`
  - Página **Equipe** (`/app/equipe`, somente admin): convidar por e-mail com
    perfil (admin/cliente/revisor), listar convites (pendente/aceito/revogado/
    expirado), reenviar, revogar
  - Convite = link com token único válido por 7 dias; página pública de aceite
    `/convite/:token` (define nome + senha, sai logado)
  - Envio de e-mail plugável via SMTP (`SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/
    `SMTP_PASS`/`SMTP_FROM`, nodemailer) — **sem SMTP configurado o app mostra
    o link para copiar ou compartilhar no WhatsApp** (nunca bloqueia o convite)
  - DB: tabela `convites` (migração 0002)
- **Envio Rápido** (`/app/rapido`): fluxo de 3 toques para o colaborador —
  foto do recibo (câmera no mobile) → confirma os campos do OCR → veredito
  (motor tributário + agente de política). Reutiliza o wizard existente
- **Onboarding** no Dashboard: checklist de 4 passos (empresa, veículo,
  política ativa, primeira despesa) com progresso e dismiss persistente
- **WhatsApp (fundação)**:
  - Compartilhamento de convites via `wa.me` (funciona sem conta Meta)
  - Webhook `/api/webhooks/whatsapp` com verificação Meta (`WHATSAPP_VERIFY_TOKEN`)
    — base para o futuro bot (foto de recibo → OCR → despesa); passo a passo no README
- Testes: +6 (26/26 no total); smoke test do fluxo de convite ponta a ponta

## [1.1.0] — 2026-08-09

### Adicionado
- **Agente de Política de Reembolso**: além da matriz fiscal, a empresa sobe o
  documento da própria política de reembolso e um agente passa a avaliar cada
  despesa → **aprova**, **nega** ou **manda para revisão humana**:
  - Upload do documento (PDF/imagem/texto) na nova página **Política** (`/app/politica`);
    parser plugável via `POLICY_PROVIDER` (default `heuristico`) extrai regras
    estruturadas: tetos por categoria, exigência de veículo cadastrado, exigência
    de evidência, limiares de aprovação automática / revisão humana / negação
  - Wizard de importação em 3 passos (upload → revisão das regras extraídas →
    ativação), com edição manual de todas as regras antes de ativar
  - Versionamento de políticas: ativar nova versão arquiva a anterior
    (transação atômica); histórico de versões na página
  - Agente avaliador determinístico (`api/policy/agent.ts`) com trilha de
    regras aplicadas (passou/falhou/revisar) e motivos em PT-BR; default
    conservador = revisão humana
  - Integração ao fluxo existente: veredito da política aparece no resultado
    do wizard de nova despesa (OCR), no drawer da despesa e na fila de revisão;
    `negado` → despesa rejeitada; `revisão humana` → entra na fila RF-05
  - **Simulador** (dry-run) na página da política para testar cenários sem
    gravar nada
  - DB: tabela `politicas_reembolso` + colunas `politica_decisao`,
    `politica_motivo`, `politica_versao_aplicada` em `despesas` (migração 0001)
  - Seed: política demo ATIVA (v1) para Transportes Demo Ltda
  - Testes: +10 testes do agente (20/20 no total)

### Corrigido
- **Deploy fresh-DB**: migrações SQL agora são versionadas no repositório
  (removido `db/migrations/*.sql` do `.gitignore`) e aplicadas pelo
  entrypoint/setup via `db/migrations/apply.ts` — não interativo e idempotente
  (inclui `ER_FK_DUP_NAME`), substituindo `drizzle-kit migrate`

## [1.0.0] — 2026-08-09

### Adicionado
- **Sistema completo do Tax Engine** conforme especificação funcional v1.1:
  - Auth própria (email/senha, scrypt + sessão HMAC em cookie httpOnly), perfis admin/cliente/revisor
  - Cadastro multi-empresa (RF-00: CNAE, regime tributário, UF) com validação de CNPJ e combobox CONCLA
  - OCR plugável via upload (NF-e XML parseado; imagem/PDF → preenchimento assistido; provider de visão via `OCR_PROVIDER`)
  - Motor de regras RF-00 a RF-09: matriz CNAE × categoria (111 regras seedadas), crédito vs dedutibilidade IRPJ/CSLL em trilhas paralelas, segregação uso misto (§7.4), versionamento por data do fato (RF-07), teste de plausibilidade RF-09
  - Fila de revisão humana (RF-05) com evidência obrigatória (RF-04) e trilha de auditoria imutável
  - Dashboard (RF-08), Relatórios com exportação CSV/PDF (RF-06), Regras & Matriz com linha do tempo regulatória 2024→2033
  - Landing page completa (marketing) + 8 telas do app
- **Deploy self-hosted**: Dockerfile, docker-compose.yml (app + MySQL 8), entrypoint com migração + seed automáticos, setup.sh
- Documentação completa em README.md (PT-BR)
- Banco: 10 tabelas (Drizzle + MySQL), seed com 3 usuários demo + empresa demo + 111 regras

### Infra de repositório
- Branch default `main`; fluxo de trabalho: branches `feat/*`/`fix/*` → merge → tag de versão

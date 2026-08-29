# Brief técnico v2 — Categoria de despesa vira metadata por cliente (banco_meta)

> **Status: APROVADO pelo dono (29/08/2026) com 3 travas (§4), incorporadas.**
> Convertido em `pipeline/briefs/0012-categoria-metadata.json` — este arquivo é a
> especificação de referência; o JSON é a entrada da fila.

---

## 1. Princípio central (o ganho real da 0012)

**Categoria de reembolso é configuração/dado da empresa; categoria fiscal é
vocabulário interno do motor fiscal.**

O brief não é "tirar um enum" — é estabelecer formalmente a fronteira:

```
POLÍTICA DA EMPRESA (documento, D-013)
       ↓ parser
categorias_despesa          ← vocabulário DO CLIENTE (0012)
       ↓
 motor de reembolso (D-013: só aprova com regra explícita da política)
       ↓
mapeamento_categoria_fiscal ← tradução explícita (0013)
       ↓
categorias_fiscais          ← vocabulário INTERNO do motor fiscal (0013)
       ↓
 regras_elegibilidade / motor fiscal (D-014/D-017)
```

Essa fronteira evita que o mesmo problema reapareça em outras partes do
sistema: "estacionamento", "parking" ou "despesa_estacionamento" de clientes
diferentes mapeiam para a mesma natureza fiscal **sem contaminar** o motor de
reembolso — e sem que o vocabulário arbitrário de um cliente vire DDL.

## 2. Evidência do problema (hoje, no código)

Dois vocabulários de categoria **divergentes e congelados**:

1. **`categoriaDespesaEnum`** (`db/schema.ts:32`) — 6 valores fixos
   (`combustivel, alimentacao, hospedagem, pedagio, uber, taxi`), usado em
   `despesas.categoria` (:187) e `declaracoes_perfil.categoria` (:479).
2. **Prompts dos parsers de política** (`api/modules/reembolso/policy/gemini.ts:42`,
   `mistral.ts:57`) — lista **diferente**: `alimentacao, transporte, hospedagem,
   km, saude, educacao, outros` (5 desses valores nem cabem no enum).

O OCR de visão (`api/modules/fiscal/ocr/visao.ts:39`) devolve `categoriaSugerida`
livre que morre na fronteira do enum. Categoria escrita na política do cliente
mas ausente do código = dado perdido ou rejeitado — na prática, a fonte da
verdade das categorias hoje é um enum no repo, não a política (D-013 violada
na prática). Precedente do padrão certo na própria base:
`empresas_config.tarifa_km` (5 empresas ajustadas em 28/08 com UPDATE, sem
deploy).

## 3. Modelo de dados (0012)

```sql
categorias_despesa (
  id          serial PRIMARY KEY,            -- identidade
  empresa_id  bigint unsigned NOT NULL REFERENCES empresas(id),
  slug        varchar(64)  NOT NULL,         -- identificador externo estável
  rotulo      varchar(100) NOT NULL,         -- apresentação PT-BR
  origem      enum('parser_politica','manual_admin','migration_backfill') NOT NULL,
  ativa       boolean NOT NULL DEFAULT true, -- derivada da política VIGENTE (ver §4)
  created_at  / updated_at padrão,
  UNIQUE (empresa_id, slug),
  UNIQUE (empresa_id, id)                    -- alvo da FK composta
)

politica_categorias (                        -- rastreabilidade por versão (D-013)
  politica_id          bigint unsigned NOT NULL REFERENCES politicas_reembolso(id),
  categoria_id         bigint unsigned NOT NULL REFERENCES categorias_despesa(id),
  rotulo_no_documento  varchar(150) NOT NULL, -- como aparecia no PDF
  PRIMARY KEY (politica_id, categoria_id)
)
```

**Decisão adotada da revisão:** consumidores guardam **`categoria_id`**, não o
slug — o slug não vira chave de negócio imutável e pode ser renomeado depois.
`despesas` e `declaracoes_perfil` passam a `empresa_id + categoria_id` com
**FK composta** para `(empresa_id, id)` (proteção cross-tenant, lição 0008/0009).
`politica_categorias` responde "qual documento fez estacionamento existir?" e
"em quais versões essa categoria existia?" — `ativa` deixa de ser a única
memória histórica.

**Backfill (somente legado):** as 6 categorias atuais são inseridas para
empresas existentes com `origem='migration_backfill'` (verdade auditável —
nenhum admin criou essas linhas à mão). **Empresa nova nasce com ZERO
categorias ativas** até a primeira política ser ativada — sem seed canônico
(a união das duas listas divergentes era dívida técnica dos prompts antigos,
não verdade de política). Se um dia houver template de onboarding, será
explicitamente "template", nunca "política".

## 4. Fluxo de ativação (transacional — ponto da revisão)

Categorias **nunca** mudam no mero upload. O fluxo é:

```
upload → parse (Gemini/Mistral) → validação → persistência da versão
      → ativação TRANSACIONAL da política → recomputação das categorias ativas
```

**TRAVA 1 — ativação é o único ponto de mutação.** Parser concluído **não**
significa política ativada: a transação de ativação (virada de `status` para
`ativa` + atualização de `politica_categorias` + recomputação das categorias)
é uma única unidade atômica. Somente ela pode alterar o conjunto vigente.

- Falha no meio do parsing → política anterior e suas categorias **intactas**.
- Recomputação só roda sobre a política que virou `ativa` — a relação
  `politica_categorias` da versão vigente define o conjunto corrente; o que
  saiu da política nova fica `ativa=false` (**nunca DELETE** — despesas
  históricas referenciam) e segue legível no histórico e no dossiê.
- Reupload idempotente da mesma política = zero mudanças.

**TRAVA 2 — a 0012 não antecipa conhecimento fiscal.** Nenhuma coluna
"temporária", nenhum slug fiscal embutido, nenhuma compatibilidade provisória
com `regras_elegibilidade` nas tabelas novas. A fronteira com a 0013 permanece
limpa: `regras_elegibilidade.categoria` segue **intocada** no enum legado até a
0013 (o `categoriaDespesaEnum` sobrevive apenas para essa tabela, como legado
não modificado — não como ponte).

**TRAVA 3 — semântica precisa de `ativa`.** `ativa=true` significa
**"presente na política atualmente vigente da empresa / disponível para uso
corrente"** — um cache derivado da versão ativa, recomputado a cada ativação.
A fonte histórica é `politica_categorias`; `ativa` **nunca** é usada como
substituto de histórico (auditoria e dossiê leem a relação por versão).

## 5. Slug — 100% no código

O LLM devolve o **rótulo encontrado no documento**; o slug nasce no código:

```
normalizarCategoria("Alimentação em viagem") → "alimentacao_em_viagem"
```

Colisão é determinística: `"Táxi"` e `"Taxi"` → `taxi` → **mesmo registro**,
atualização de rótulo, nunca duplicata. `varchar(64)` (30 estourava fácil em
categorias reais).

## 6. Decisões de vocabulário (fechadas na revisão)

- **`km` NÃO é categoria.** É modalidade/base de reembolso:
  `transporte → modalidade quilometragem → quantidade (82 km) × tarifa R$/km`,
  enquanto `combustivel → documento fiscal → valor R$`. Consequência a
  detalhar na spec da 0012: as regras de km que o parser extrai hoje viram
  **atributo de modalidade** da categoria `transporte` (ou equivalente na
  política), não categoria própria.
- **`outros` não é fallback técnico.** Não classificado = `categoria_id NULL` +
  revisão manual (D-013). `outros` só existe se a política da empresa tiver
  literalmente uma categoria equivalente ("Outras despesas até R$ 100") —
  aí é categoria real daquela empresa.

## 7. Decisões do §7 da v1 — FECHADAS

1. ~~Vocabulário inicial por união das listas~~ → **não**: backfill só para
   legado; empresas novas nascem da política; `km` fora da taxonomia.
2. **`regras_elegibilidade` NÃO migra na 0012** → camada separada: taxonomia
   fiscal global (`categorias_fiscais`) + tradução explícita
   (`mapeamento_categoria_fiscal`) na **0013**. A matriz fiscal não depende do
   vocabulário arbitrário de cada cliente.
3. ~~`outros` como fallback~~ → **não**: null + revisão manual.

## 8. Segurança multi-tenant (ponto da revisão, com achado adjacente)

Endpoints novos **derivam o tenant do contexto autorizado**
(`ctx.empresaId` da sessão), nunca do input do cliente web — a FK composta
protege o banco, mas não impede um endpoint mal autorizado de listar categorias
da empresa B. **Achado adjacente confirmado:** routers atuais recebem
`empresaId` pelo input (ex.: `api/routers/colaboradores.ts:17`) com guarda
server-side (`assertAdminDaEmpresa`) — o padrão existe mas depende de cada
endpoint lembrar de assertar. A 0012 não repete esse padrão; endurecimento dos
endpoints existentes fica registrado como risco conhecido (demanda própria).

## 9. Sequência exigida da migração (com evidência, não suposição)

```
CREATE categorias_despesa + politica_categorias
→ backfill (origem=migration_backfill)
→ ASSERT: nenhum consumidor sem categoria correspondente
→ converter enum → categoria_id nos consumidores
→ índices → FKs compostas
→ ASSERT final de integridade
```

O `ALTER` em `despesas` pode envolver rebuild/lock conforme a versão do MySQL:
**verificar a versão concreta e medir o lock no teste da migração** — vira
evidência registrada, não premissa ("tabela pequena" não é argumento, é número
a medir).

## 10. Critérios de aceite (0012)

Migração e integridade:
- Aplica **e reverte** em banco com dados; boot re-executa sem erro (padrão
  0008–0010); tempo de lock do `ALTER` medido e registrado.
- Banco rejeita categoria cross-tenant (FK composta) **e** API rejeita leitura
  cross-tenant (tenant do ctx) — dois testes separados.

Política e categorias — **cenário obrigatório** (prova atomicidade,
versionamento, desativação e preservação histórica num só teste):
- Política v1 (alimentacao, hospedagem, estacionamento) → ativa as três.
- Upload de v2 **com parsing quebrado** → tudo permanece exatamente como v1.
- Política v2 validada (alimentacao, hospedagem) → `estacionamento` permanece
  no banco, fica fora da vigente, **despesas históricas seguem válidas e
  legíveis**.
- Reupload idempotente da mesma política = zero mudanças.
- Duas execuções/retries simultâneos do processamento não produzem duplicatas
  nem desativação indevida.
- Empresas A e B com o mesmo slug convivem com rótulos/regras diferentes.
- Colisão de normalização de slug ("Táxi"/"Taxi") → mesmo registro.
- Categoria não classificada → `categoria_id` NULL + revisão manual (nunca
  "outros" automático).

Regressão:
- Decisão do motor idêntica para as categorias atuais (fixtures da política 13
  intactas); nenhum literal de categoria fora de seeds/fixtures no diff final;
  vitest + tsc no container de check.

## 11. Fora de escopo

- **0013 (próxima):** `categorias_fiscais` + `mapeamento_categoria_fiscal` +
  migração de `regras_elegibilidade` para a taxonomia fiscal.
- `motorizacaoEnum` / `kmPorLitroDeclarado` NOT NULL (elétrico sem km/l) e
  `equipeColaboradorEnum` — follow-ups do mesmo padrão.
- Inferência de categoria fora do documento da política — proibida (D-013).
- Template de onboarding de categorias — se um dia existir, é "template"
  explícito, nunca verdade de política.

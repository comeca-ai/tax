# Auditoria de código — `feat/politica-ocr-paddle` — 17/09/2026

Responsável: Claude Code (agente `audit-codigo`), pedido do usuário "audita os códigos". Revisão automatizada assistida por leitura de código; não constitui aceite humano nem segunda revisão para áreas sensíveis.

Base: `pr/main` (`2058e3f`, o que a homolog roda) → `fd39e20`. 17 commits, 35 arquivos. O `main` local (`b22d134`) está cinco PRs atrás e **não** foi usado como base.

Gates: `tsc --noEmit` ✓ · `eslint` (35 arquivos) ✓ · `vitest` 332/332 ✓ (30 arquivos do escopo) · sidecar `unittest` 11/11 ✓ · `git diff --check` ✓ · varredura de segredos em `git log -p` ✓.

## Resumo executivo

1. **Um P0 de doutrina (D-013/D-014):** quando o PaddleOCR lê um comprovante, `visao.ts` devolve a extração do heurístico, que não produz `tipoDocumento`/`confiancaTipo`/`consumidorIdentificado`; o decisor pula o passo "comprovante não fiscal" e um recibo Pix/cartão com valor e data é **aprovado** por regra de valor. Antes da branch, a IA de visão marcava `comprovante_pagamento` e a regra da política negava.
2. **Escopo ampliado sem ADR:** a decisão do usuário em 17/09 (Paddle é o OCR nos dois fluxos; IAs pagas só como fallback) autoriza o toque em `fiscal/`, mas `services/paddle-ocr/README.md:3-6` e `server.py:1-11` ainda dizem "só política", e não há registro em `DECISOES.md`. A cascata real também mudou: o chat da Mistral saiu; OpenRouter (terceiro novo, `data_collection: "deny"`) estrutura o texto; Mistral OCR anotado só lê binário.
3. **Sidecar:** rede/auth/systemd corretos e porta 4191 consistente. O problema é robustez: trava global + 60 páginas + timeout de 120 s no Node fazem uma política de 16 páginas bloquear todo OCR de comprovante por minutos, mandando cada um para a IA paga.

## Tabela P0–P3

| # | Sev. | Regra (documento) | Código | Correção |
|---|---|---|---|---|
| 1 | **P0** | D-013 ("nenhuma aprovação sem regra"), D-014 item 1 ("consumidor não identificado" é padrão anômalo) — `docs/DECISOES.md:297,324`; POLITICA-DE-USO-DE-IA "regra/parser antes de modelo" | `api/modules/fiscal/ocr/visao.ts:404-428`, `api/modules/fiscal/ocr/index.ts:240-255`, `api/modules/reembolso/decisor/index.ts:128,156,238-248` | Classificador determinístico de `tipoDocumento` + `consumidorIdentificado` no heurístico, `confiancaTipo` ≤ `media`; teste com recibo Pix via sidecar esperando `revisao_manual` |
| 2 | P1 | POLITICA-DE-USO-DE-IA "degradação segura"; CHANGELOG promete "IA paga só quando o local não entrega" | `services/paddle-ocr/server.py:27,137`, `api/lib/ocrLocal.ts:99`, `services/paddle-ocr/README.md:126` | `lock.acquire(timeout=…)` → 503 `ocupado`; orçamento de páginas compatível com o timeout |
| 3 | P1 | POLITICA-DE-RELEASE-E-DEPLOY "configuração fora do código" | `api/modules/reembolso/policy/arquiteto.ts:6,28-33,199`, `api/modules/reembolso/policy/openrouter.ts:52-55`, `.env.example:65` | Env própria para o upload (`POLICY_UPLOAD_OPENROUTER_MAX_OUTPUT_TOKENS`, default 32 000) |
| 4 | P2 | CONTRIBUTING "branch de único objetivo" e "revisão de segunda pessoa"; GOVERNANCA "áreas sensíveis"; ADR por provedor (D-025) | branch inteira; `docs/DECISOES.md`; `services/paddle-ocr/README.md:3-23`; `services/paddle-ocr/server.py:1-11` | ADR D-026 (Paddle nos dois fluxos + OpenRouter no upload); atualizar README/docstring; registrar segunda revisão no PR |
| 5 | P2 | POLITICA-DE-RELEASE-E-DEPLOY "configuração fora do código" | `.env.example:45-48,63`, `.env.docker.example`, `docker-compose.yml:101`, `CHANGELOG.md:82`, `services/paddle-ocr/deploy/paddle-ocr.service:41`, `services/paddle-ocr/README.md:69-71` | Sincronizar cascata, valores de `POLICY_PROVIDER`, `OCR_LOCAL_COMPLEMENTAR_IA`, limites de memória, nota do interpretador fora de `/root` |
| 6 | P2 | POLITICA-DE-RELEASE-E-DEPLOY req. 5 "CHANGELOG com impacto e rollback" | `CHANGELOG.md:9-27,29-44` | Acrescentar impacto/rollback nas duas seções |
| 7 | P2 | auditoria 15/09 §3.4 "utilitário usado por dois motores mora em `api/lib/`" | `comTimeout` em 4 arquivos; `arquiteto.ts:179-186` vs `openrouter.ts:44-50`; `visao.ts:358-370` vs `:445-453` | `api/lib/ia/comTimeout.ts`, `modelosOpenRouter` único, lista única de campos essenciais |
| 8 | P2 | GOVERNANCA "testes relevantes"; auditoria §3.6 "cobertura de fachada" | `api/modules/reembolso/policy/mistral.ts:465,518-522`, `parser.ts:432`, `api/modules/fiscal/ocr/visao.ocrLocal.test.ts` | Teste `POLICY_PROVIDER=mistral-ocr` com texto local usando `original`; asserts de `tipoDocumento` |
| 9 | P2 | POLITICA-DE-RELEASE "segurança operacional"; auditoria §3.3 upload | `services/paddle-ocr/server.py:89,106-110,150-155` | Clamp de pixmap; `timeout` de socket no handler; `compare_digest` com bytes |
| 10 | P3 | Decisão 17/09 "IA só como fallback" | `api/modules/reembolso/policy/parser.ts:432,455-459` | Documentar `mistral-ocr` como diagnóstico; não usar em homolog |
| 11 | P3 | CONTRIBUTING "nunca versione dumps"; GOVERNANCA "história auditável" | `docs/poc/evidencias/browser-{9aa8a283,b012ea9e,b466f5f6,e3ebde23}/` (não rastreados) | Fora desta branch; os dois EPERM são ruído |

## P0 — bloqueia merge/deploy

### 1. Comprovante lido pelo Paddle perde o tipo de documento — recibo de pagamento vira despesa aprovada

**Regra:** D-013, D-014 item 1 (`docs/DECISOES.md:297-345`); `docs/ARQUITETURA.md:53`; POLITICA-DE-USO-DE-IA ("tarefas resolvíveis com regra ou parser não usam modelo").

**Evidência:**
- `api/modules/fiscal/ocr/visao.ts:404-428` — no ramo "texto local", devolve `{ ...extracao, provedor: … }` onde `extracao` vem de `this.fallbackTexto.extrair(...)` (o heurístico).
- `api/modules/fiscal/ocr/index.ts:240-255` — o `return` do `HeuristicOcrProvider` não tem `tipoDocumento`, `confiancaTipo`, `consumidorIdentificado` nem `resumoItens`. O prompt da IA (`visao.ts:37-57`) produzia os quatro.
- `api/modules/reembolso/decisor/index.ts:128` — `const tipoDoc = extracao.tipoDocumento ?? null`; `:156` — o passo 0.5 só roda com `tipoDoc` preenchido; `:238-248` — com valor, data e categoria, segue para `avaliarDespesa` e retorna `aprovado`.
- `visao.ocrLocal.test.ts` — nenhum assert sobre `tipoDocumento`; o fixture de `index.cupomOcr.test.ts:164` contém "CONSUMIDOR NAO IDENTIFICADO" e nenhum teste afirma que isso vira aviso.

**Consequência:** com `OCR_LOCAL_URL` no ambiente (homolog desde 17/09) e política com regra "exige nota fiscal", um recibo Pix/TED ou canhoto de maquininha com CNPJ, valor e data é aprovado automaticamente citando só a regra de teto. O aviso "Consumidor NÃO identificado" (D-014) também some.

**Correção:** em `api/modules/fiscal/ocr/index.ts`, ao lado de `sugerirCategoria`:
```ts
/** Tipo do documento por rótulos explícitos; nunca "alta": quem confirma é o gestor (D-013). */
function tipoDocumentoNoTexto(t: string): { tipo: TipoDocumento | null; confianca: "media" | "baixa" | null } {
  const s = t.toLowerCase();
  // Marcadores fiscais PRIMEIRO: uma NFC-e com "Forma de pagamento: PIX" é nota fiscal, não comprovante.
  if (/nfc-?e|nf-?e|danfe|nota\s+fiscal|chave\s+de\s+acesso|cupom\s+fiscal/.test(s)) return { tipo: "nota_fiscal", confianca: "media" };
  if (/extrato\s+(de\s+)?conta|extrato\s+banc/.test(s)) return { tipo: "extrato_conta", confianca: "media" };
  if (/comprovante\s+de\s+(pagamento|transfer[êe]ncia|pix)|\bpix\b|\bted\b|\bdoc\b|maquininha|cupom\s+n[ãa]o\s+fiscal|documento\s+n[ãa]o\s+fiscal/.test(s)) return { tipo: "comprovante_pagamento", confianca: "media" };
  if (/\brecibo\b/.test(s)) return { tipo: "recibo", confianca: "baixa" };
  return { tipo: null, confianca: null };
}
const consumidorIdentificado = /consumidor\s+n[ãa]o\s+identificado/i.test(texto) ? false : (/\bcpf\b|\bcnpj\b.*consumidor|consumidor.*\bcnpj\b/i.test(texto) ? true : null);
```
> Nota do revisor: a ordem original sugerida pelo auditor testava `pix|ted|maquininha` antes dos marcadores fiscais; isso mandaria todo cupom NFC-e pago com Pix para revisão manual. A ordem acima testa fiscal primeiro e só cai em `comprovante_pagamento` quando nenhum marcador fiscal aparece. Cobrir com teste: NFC-e com "Forma de pagamento: PIX" → `nota_fiscal`.

Incluir `tipoDocumento`, `confiancaTipo` e o aviso "Consumidor NÃO identificado no documento (sem CPF/CNPJ)." no `return` de `:240-255`. Com `confiancaTipo: "media"` o decisor (`:181-195`) manda para revisão manual, nunca nega sozinho (D-013).
Teste obrigatório em `visao.ocrLocal.test.ts`: sidecar devolve "COMPROVANTE DE PAGAMENTO PIX / Restaurante X / CNPJ … / 13/09/2026 / Valor 87,40" → `tipoDocumento === "comprovante_pagamento"`, `confiancaTipo === "media"`; em `decisor.test.ts` esse caso → `revisao_manual` com `regrasAplicadas[0].regra === idDocFiscal`.

## P1 — corrigir antes do PR

### 2. Trava global do sidecar × 60 páginas × timeout de 120 s

**Evidência:** `services/paddle-ocr/server.py:137` — `with self.lock:` sem timeout de espera; `:27` — `MAX_PAGINAS=60`; `api/lib/ocrLocal.ts:99,135` — `AbortSignal.timeout(120_000)`; `README.md:106-116,126` — "12,7 s/página", "não para OCR por despesa", enquanto `bad955c`/`67cb428` ligam o OCR por despesa (web `despesas.ts:59`, WhatsApp `worker.ts:180,428`) ao mesmo sidecar.

**Consequência:** política de 16 páginas ≈ 3,5 min de lock. Cada comprovante nesse intervalo espera 120 s, recebe `TimeoutError` e cai em Mistral/OpenAI vision (`ocrLocal.ts:182-188`). PDF de 60 páginas segura o serviço ~13 min; o Node desiste, o sidecar continua rasterizando.

**Correção:**
```python
# server.py, App.ocr
if not self.lock.acquire(timeout=float(os.environ.get("PADDLE_OCR_ESPERA_S", "5"))):
    raise ServicoOcupado()          # → 503 {"error": "ocupado"} no Handler
try:
    paginas = self.motor.ler(conteudo, mime, nome, orcamento_s=MAX_SEGUNDOS)
finally:
    self.lock.release()
```
Em `MotorPaddle.ler`, checar `time.time() - inicio > orcamento_s` entre páginas → `DocumentoInvalido` (422). Alinhar `PADDLE_OCR_MAX_PAGINAS` ao que cabe em `OCR_LOCAL_TIMEOUT_MS` (≈ 9 páginas) ou fazer `POLICY_OCR_TIMEOUT_MS` valer só em `policy/ocr.ts`. Teste em `test_server.py`: duas requisições concorrentes com motor que dorme → segunda recebe 503 sem esperar.

### 3. `POLICY_OPENROUTER_MAX_OUTPUT_TOKENS` com duas semânticas

**Evidência:** `arquiteto.ts:6,28-33,199` — default 4 000, aceita 1 000–16 000; `openrouter.ts:52-55` — mesma env, default 32 000, aceita 1 000–64 000; `.env.example:65` — `# POLICY_OPENROUTER_MAX_OUTPUT_TOKENS=4000` sob "Arquiteto"; `mistral.ts:303` — "8 000 cortava políticas com dezenas de regras".

**Consequência:** operador descomenta a linha do exemplo → toda política média via OpenRouter volta com `finish_reason: "length"` → `openrouter.ts:107-108` lança → OpenAI (sem crédito) → heurístico. Silencioso na UI.

**Correção:** em `openrouter.ts:53` usar `POLICY_UPLOAD_OPENROUTER_MAX_OUTPUT_TOKENS ?? 32_000`; separar as duas linhas no `.env.example`. Idem para `POLICY_OPENROUTER_MODELS` (arquiteto e upload com defaults diferentes: `openrouter/free` vs trio OpenAI).

## P2 — corrigir nesta branch ou abrir issue nomeada

### 4. Escopo ampliado e cascata redesenhada sem ADR, docs ou segunda revisão

A branch reúne seis temas (OCR da política, OCR do comprovante, lista de modelos do arquiteto, `onError` do tRPC, remoção do passo "Campos customizados", remoção do selo de confiança). `services/paddle-ocr/README.md:3-6,13-23` e `server.py:1-11` ainda dizem "só política" e descrevem a cascata antiga. `DECISOES.md` não registra: (a) Paddle como OCR dos dois fluxos; (b) OpenRouter como terceiro no upload (`parser.ts:393-424`, `openrouter.ts:83` com `data_collection: "deny"`); (c) chat da Mistral removido por cota do workspace de homolog (`parser.ts:435`), condição de ambiente virando código. Não há violação de D-014: `api/lib/ocrLocal.ts` é plataforma compartilhada e não há import cruzado novo entre motores.

**Correção:** (1) D-026 em `DECISOES.md`; (2) README/docstring do sidecar: "política e comprovante", ordem real de `parser.ts:393-424`; (3) marcar no PR "área sensível — segunda revisão" para `fiscal/ocr/` e OpenRouter; (4) separar `66e377a` (tRPC log) e `e6844d0`/`1362606` (UI) em PR próprio.

### 5. Configuração e documentação operacional desatualizadas

- `.env.example:45-48` descreve "cascata Mistral -> OpenAI -> heurístico"; a real é `parser.ts:393-424`. Listar os valores `openrouter`, `mistral-ocr`, `mistral-chat` (`parser.ts:426-437`), ausentes de todo `.env*`.
- `OCR_LOCAL_COMPLEMENTAR_IA` (`visao.ts:415`) ausente de `.env.example`, `.env.docker.example` e `docker-compose.yml`.
- `.env.example:63` — `POLICY_OPENROUTER_MODELS` comentada como "Arquiteto"; também lida por `openrouter.ts:45`.
- Memória: `CHANGELOG.md:82` "MemoryMax=3G" vs `paddle-ocr.service:41` `MemoryMax=4G` vs `docker-compose.yml:101` `mem_limit: 3g`, com `README.md:116` medindo pico de 3,5 GB → no compose o kernel mata o processo. Alinhar em 4G.
- `README.md:69-71,89-94` — instrui `python3.12 -m venv venv` sem avisar que, com `ProtectHome=true` (`paddle-ocr.service:33`), o interpretador não pode viver em `/root`/`/home` (incidente da homolog: Python copiado para `/opt/paddle-ocr/python`).

### 6. CHANGELOG sem impacto/rollback

`CHANGELOG.md:9-27` e `:29-44` não têm linha de rollback nem custo; só `:73-88` tem. Acrescentar "Impacto" e "Rollback: `POLICY_PROVIDER=mistral-chat` restaura o chat da Mistral; remover `OCR_LOCAL_URL` restaura a IA de visão no comprovante".

### 7. Duplicação entre motores e parsers

`comTimeout` idêntico em `fiscal/ocr/visao.ts:168`, `policy/openai.ts:30`, `mistral.ts:265`, `openrouter.ts:57`. `modelosOpenRouter()` (`arquiteto.ts:179-186`) e `modelosPolitica()` (`openrouter.ts:44-50`) fazem o mesmo parse. Mapeamento de confiança em `openai.ts:143`, `mistral.ts:408,524`, `openrouter.ts:151`. Remoção de cercas em `mistral.ts:355,508` e `openrouter.ts:109`. `faltamParaDecidir` (`visao.ts:358-370`) repete a lista de `visao.ts:445-453`. Correção: `api/lib/ia/comTimeout.ts`; `policy/ruleset.ts` com `confiancaDe` e `semCercas`; `modelosOpenRouter(env, default)` único; `CAMPOS_ESSENCIAIS` único.

### 8. Cobertura de fachada nos ramos novos

(a) `fd39e20` (`parser.ts:432`) e o caminho `input.original` (`mistral.ts:465,518-522`; `ocr.ts:32-36`) — nenhum teste seta `mistral-ocr` nem verifica que o binário original vai ao `/v1/ocr` quando o input já é `text/plain`; (b) `visao.ocrLocal.test.ts` não afirma `tipoDocumento`; (c) `test_server.py` não cobre 413 por `Content-Length` nem `MAX_PAGINAS`.

### 9. Sidecar: PDF hostil e transporte

`server.py:89` — `get_pixmap(dpi=self.dpi)` sem limite de dimensão: página de 200×200 pol. a 200 DPI ≈ 4,8 GB → `MemoryMax=4G` mata o serviço inteiro; `:150-155` — `Handler` sem `timeout` de socket; `:110` — `compare_digest` com `str` lança `TypeError` se o header tiver não-ASCII. Verificados e corretos: bind `127.0.0.1` (`:21`), token obrigatório (`:175-178`), `Content-Length` limitado (`:184`), sem log de corpo/token (`:154`), `User=paddle-ocr` + `ProtectSystem=strict` + `CapabilityBoundingSet=` (unit `:8-37`), compose sem `ports`.
Correção: `escala = min(1, MAX_LADO_PX / max(rect.width, rect.height) / (dpi/72))` com `matrix=pymupdf.Matrix(...)`; `Handler.timeout = 30`; `compare_digest(cabecalho.encode(), esperado.encode())`.

## P3

### 10. `POLICY_PROVIDER=mistral-ocr` força OCR pago mesmo com texto local
`parser.ts:432,455-459`: `comTextoPreparado` envolve qualquer parser, então a seleção explícita paga ~13 s/página de CPU e depois a Mistral. Documentar como diagnóstico; lembrar que `Relatorio/publicar-pr58.py:34` já setou `POLICY_PROVIDER` em homolog por acidente.

### 11. Diretórios de evidência não rastreados
`browser-b012ea9e…` e `browser-b466f5f6…` são falhas EPERM de 8 KB (apagar). `browser-9aa8a283…` e `browser-e3ebde23…` são runs de 15/09 citados por `docs/auditoria/2026-09-15-auditoria-integrada.md:30,120`. Commit `docs:` separado ou nota no documento; nada entra no PR desta feature.

## Sugestões sem regra escrita

- `schemaRuleset.ts:245-255,240` repete `UNIDADES_LIMITE`/`REEMBOLSAVEL_REGRA` de `contracts/types.ts` e do prompt (`mistral.ts:46-75`); um teste de igualdade evita divergência silenciosa.
- `logarErroInterno` grava `causa.message` no journal; quem lançar `TRPCError` com `cause` de provedor não deve embutir corpo de resposta.

## O que NÃO fazer agora

- Não resolver o item 1 chamando a IA de visão quando faltar `tipoDocumento`: contradiz "IA só como fallback" e "parser antes de modelo".
- Não estimar tokens para o `/v1/ocr` anotado da Mistral; `pocConsultas.ts:72-76` já deixa `null`.
- Não devolver o chat da Mistral só porque o `.env.example` o descreve: registrar a decisão (item 4).
- Não unificar `HeuristicOcrProvider` e `HeuristicPolicyParser` (dois motores, D-014).

## Verificado e conforme

- Nenhum import cruzado novo entre `reembolso/` e `fiscal/`; nenhum `DELETE`, migração ou uso de `colaboradores.cargo`; `regrasExtraidasDe` mantém `exigeDocumentoFiscal=false`/`decisaoAutomatica="nenhuma"` (D-013); `sugerirCategoria` devolve `null` para mercado/hortifruti → revisão manual.
- Política de IA por chamada: OpenRouter, Mistral `/v1/ocr` anotado e OpenAI Responses identificadas em `pocConsultas.ts`, via `fetch` global (ledger intercepta), teto de saída explícito, timeout, provedor/modelo por env, sem prompt/documento/chave em log ou aviso. `data_collection: "deny"` e `require_parameters` no OpenRouter. Nenhuma chamada a modelo em cron, health, teste ou script.
- Cascata real (testada em `cascata.test.ts` e `ocr.test.ts` afirmando quais endpoints foram chamados): texto nativo → Paddle → [texto] OpenRouter → OpenAI → heurístico; [sem texto] Mistral OCR anotado → OpenAI `input_file` → heurístico. Aviso final nomeia `resultado.provedor`.
- Regressão de homolog `a63461c` tem teste com o cenário exato (`parser.test.ts:110-125`).
- Porta 4191 consistente em todos os arquivos; nenhuma referência a 4190 fora da explicação do "bad port".
- Segredos: `PADDLE_OCR_TOKEN=` vazio no exemplo; `runtime.env` fora do Git; `.gitignore` exclui `.env*` e `venv/`.
- `logarErroInterno` (`middleware.ts:22-36`): só `INTERNAL_SERVER_ERROR`; `middleware.erros.test.ts` prova que `EACCES` vai ao log e não à resposta.
- Front: `PoliticaCamposStep` continua no repositório com teste e comentário de religamento (`Politica.tsx:453-457`); nenhum componente conhece a API além do contrato tRPC.
- Commits: `tipo(escopo): descrição` em português, um objetivo por commit.

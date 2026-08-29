# reembolsa.ia — Arquitetura do redesenho (cérebro + duas superfícies)

> Deriva de `docs/PRODUTO.md`. Status: **proposta** — norte para as próximas releases,
> não descrição do sistema atual (v1.4.x). Marcas ✅/🟡/❌ indicam o que já existe.

---

## 1. Princípio estrutural: um cérebro, duas superfícies

```
                ┌─────────────────────────────┐
                │            BRAIN            │
                │  política · decisor · dossiê│
                └──────┬──────────────┬───────┘
                       │              │
              ┌────────▼───┐   ┌──────▼────────┐
              │  WEB (app) │   │ AGENT (Zap)   │
              │ back office│   │ conversação   │
              └────────────┘   └───────────────┘
                       │              │
                ┌──────▼──────────────▼───────┐
                │   MySQL (fonte da verdade)  │
                └─────────────────────────────┘
```

- **brain/** — pacote de biblioteca, sem HTTP e sem UI. Toda decisão de negócio mora
  aqui, exatamente uma vez. Se o app e o WhatsApp divergirem numa decisão, a tese do
  produto (fim do achismo) morre — por isso a regra existe em um lugar só.
- **web/** — back office (React + tRPC/Hono, ✅ existe). Vira consumidor do cérebro:
  fila de revisão manual, painel-caixa-de-entrada, botão do dossiê.
- **agent/** — serviço novo. Magro por definição: recebe mídia/texto, gerencia a
  máquina de estados da conversa, chama o cérebro, traduz a resposta para linguagem
  humana. **Nunca decide nada sozinho.**

Dois processos de deploy a partir do mesmo repo:
1. `app` — web + API tRPC (✅ container atual)
2. `agent` — worker WhatsApp (❌ novo container no mesmo docker-compose)

---

## 2. Pacote BRAIN (a extrair/construir)

> **Layout de código (v1.6.5, D-014):** os dois motores vivem em módulos separados —
> `api/modules/reembolso/` (agente + policy + whatsapp) e `api/modules/fiscal/`
> (engine + ocr + cnpj). Plataforma compartilhada (auth, routers, mail, db) fora dos
> módulos. Mapa completo em `api/modules/README.md`.

| Módulo | Responsabilidade | Status |
|---|---|---|
| `brain/policy` | Parser de política (PDF→regras) ✅ v1.4.3 + **versões da política** ❌ + incorporação de regra nova vinda de exceção ❌ | 🟡 |
| `brain/decisor-reembolso` | Extrai (OCR/visão) + verifica: política (regra explícita) + **padrões anômalos** (valor>teto, consumidor não identificado, natureza≠categoria, horário incoerente, duplicidade) → `APROVADA` / `REPROVADA(regra citada)` / `REVISAO_MANUAL(motivo material)` — **só aprova com regra explícita; ninguém preenche nada (D-013/D-014)** | ❌ |
| `motor/fiscal` (existente) | Apuração tributária: créditos, CFOP/NCM/CST, elegibilidade por regime. **Motor separado, entra depois, regras próprias (D-014)** — decisões e trilhas independentes do reembolso | 🟡 |
| `brain/perfil` | Checklist contextual por pessoa: o que falta para defender cada categoria que ela declarou (veículo, etc.) | ❌ |
| `brain/dossie` | Monta o kit zip de recuperação: por despesa, documento fiscal + evidências + veículo/km + motivo + regra aplicada + trilha | ❌ (relatório parcial 🟡) |
| ~~`brain/politica-viva`~~ | ⛔ **removido (D-013)** — o sistema nunca sugere nem acrescenta regras na política; ela só muda por edição humana versionada | — |

### O contrato central (a peça mais importante do sistema)

```
decidir(despesa, politica, perfilFuncionario) →
  | { resultado: "aprovada",       regraCitada: "Alimentação: teto R$ 55" }
  | { resultado: "reprovada",      regraCitada: "...", explicacao: "nota R$ 80 > teto R$ 55" }
  | { resultado: "revisao_manual", motivo: "imagem ilegível / dado inconsistente / sem cobertura na política" }
```

**D-013:** `aprovada` exige regra explícita da política. Não existe aprovação por
tolerância, similaridade ou heurística. `revisao_manual` não é "zona cinzenta" de
decisão — é devolução ao gestor por dúvida *material*; ele também está limitado à
política. Sem regra, sem aprovação.

Toda saída de aprovação/reprovação carrega **regraCitada** — nenhuma decisão sem
fundamento textual. Esse contrato é consumido pelo agente (resposta imediata no
WhatsApp) e pelo web (fila de revisão) — mesma decisão, duas renderizações.

---

## 3. AGENT — máquina de estados da conversa

Um funcionário = uma sessão de conversa (linha no banco, estado atual + contexto JSON).
O agente é um loop: evento do WhatsApp → carrega sessão → transição → persiste → responde.

### Estados

```
NOVO_CONVITE        → funcionário chegou pelo wa.me (msg pré-preenchida c/ token)
CONFIRMANDO_DADOS   → mostra nome/matrícula/e-mail; aceita correção
DECLARANDO_PERFIL   → 3 perguntas (carro próprio? viaja? refeição c/ cliente?)
COLETANDO_CADASTRO  → pede veículo se declarou combustível (foto do documento)
PRONTO              → onboarding concluído; portão aberto para despesas

RECEBENDO_DESPESA   → foto recebida → OCR/visão → categoria detectada
DECIDINDO           → chama brain/decisor-reembolso (extrai + verifica; D-014:
                      ninguém preenche nada — sem estado de coleta de dados)
  ├─ aprovada       → responde c/ valor + regra → PRONTO
  ├─ reprovada      → responde c/ regra citada  → PRONTO
  └─ revisao_manual → "encaminhei para o gestor revisar" → AGUARDANDO_REVISAO
AGUARDANDO_REVISAO  → notificado quando o gestor decidir → informa resultado
```

Regras da máquina:
- **Timeout de coleta**: despesa incompleta há X dias → lembrete (dentro da janela
  gratuita se possível; senão template) → depois vira exceção de "evidência pendente".
- **Mensagem fora de contexto** → o agente tenta classificar (despesa nova? resposta
  da pergunta pendente?) — nunca responde com menu de ERP.
- **Correção de rota**: chegou combustível de quem não declarou → entra em
  COLETANDO_CADASTRO na hora, sem bloquear a despesa.

### Transporte WhatsApp (decisão de largada, 12/08/2026)

**Provider da largada: Evolution API** (self-hosted, container na VPS, protocolo
WhatsApp Web). Motivos: zero burocracia Meta, custo zero por mensagem, validação
imediata da v1.5.0/v1.6.0. Riscos aceitos: API não-oficial (banimento de número,
instabilidade quando o WhatsApp muda o protocolo) — mitigados com número dedicado,
volume de piloto e conversas iniciadas pelo funcionário.

**Interface isolada** — o agente nunca fala com o Evolution diretamente fora de um
adapter, mesmo padrão de `OCR_PROVIDER`/`POLICY_PROVIDER`:

```
WHATSAPP_PROVIDER=evolution  # piloto (Evolution API, self-hosted)
WHATSAPP_PROVIDER=meta       # futuro (Cloud API oficial, quando escalar)
```

Troca futura para a API oficial da Meta = **trocar o adapter, não o produto**:
sessões, máquina de estados, decisor e dossiê permanecem idênticos.

### Custo Meta (quando migrar para a API oficial)
- Convite sempre por e-mail-isqueiro → funcionário inicia (janela de atendimento).
- Respostas do agente dentro da janela de 24h = custo zero de template.
- Lembretes fora da janela: preferir e-mail; template só como último recurso.
- No piloto com Evolution, essas restrições não se aplicam (sem cobrança por mensagem),
  mas o desenho "funcionário inicia" permanece — é melhor UX e já prepara a migração.

---

## 4. WEB — o que muda no back office

| Tela/fluxo | Mudança |
|---|---|
| Pessoas | **upload em lote** (CSV/planilha): validação, resumo, disparo de convites ❌ |
| Pessoas (detalhe) | status de ativação: convidado / confirmou / pendências (veículo etc.) ❌ |
| Aprovações | vira **fila de revisão manual**: só o que o decisor devolveu (dúvida material), cada item com dossiê lateral + botões aprovar / negar — **sem "virar regra"** (D-013) ❌ |
| Política | upload ✅ + histórico de versões — regras só entram por **edição humana** (D-013) ❌ |
| Fechamento | botão **gerar kit do contador** (zip) 🟡→❌ |
| Notificações | admin/superior recebem push (e-mail/WhatsApp) com link direto para a decisão ❌ |

Aprovação item-a-item manual (✅ existe) **não acaba** — passa a ser o destino das
revisões manuais, não o fluxo principal.

---

## 5. Modelo de dados — o que sobe de novo

| Tabela | Para quê |
|---|---|
| `funcionarios` (ou extensão de `usuarios`) | matrícula, telefone, centro de custo, **`superior_matricula`** (hierarquia p/ escalação), status de ativação |
| `sessoes_conversa` | funcionário, estado atual, contexto JSON, última interação (janela Meta) |
| `despesas` (extensão) | `decisao` (auto_aprovada/auto_reprovada/revisao_manual/aprovada_manual/negada_manual), **`regra_citada`**, `politica_versao_id` |
| `revisoes` | despesa, motivo material da devolução, atribuída a (gestor/admin), decisão — **sem campo "virou_regra"** (D-013) |
| `politica_versoes` | versão, origem (**somente upload/edição humana**), texto extraído, regras estruturadas |
| `declaracoes_perfil` | funcionário × categorias declaradas (combustivel/viagem/refeição), pendências de cadastro |
| `dossies` | mês/empresa, arquivo gerado, checksum, enviado para (contador), data |

Princípio: **toda despesa guarda qual versão da política a decidiu** — é o que torna
o dossiê defensável meses depois ("essa despesa foi aprovada pela regra X da versão 3").

---

## 6. Integrações externas

| Integração | Uso | Status |
|---|---|---|
| **Evolution API** (provider da largada) | convite (wa.me), conversa, mídia — self-hosted na VPS | 🟡 usuário instala o container; adapter a construir na v1.5.0 |
| Meta WhatsApp Business API | provider futuro (escala) — mesmo adapter | ❌ webhook esqueleto ✅ (v1.2.0), sem credenciais |
| SMTP | e-mail-isqueiro de convite, lembretes, push de exceção | ❌ (hoje log) |
| OCR/visão (provider) | ler cupom/nota da foto | ❌ hook `OCR_PROVIDER` pronto, sem provider |
| ReceitaWS | CNPJ → dados da empresa | ✅ |

---

## 7. Deploy (VPS, docker-compose)

```
services:
  app:        # ✅ existe — web + tRPC + migrações no boot; agente roda como módulo do app
```
- **Evolution (D-011): stack separado**, fora do compose do app (padrão n8n/Chatwoot/
  Coolify na VPS), instalado pelo usuário. Integração 100% HTTP:
  `EVOLUTION_API_URL` + `EVOLUTION_API_KEY` + `EVOLUTION_INSTANCE` no `.env`, e o
  webhook do Evolution apontando para `/api/whatsapp/webhook`. Se o Evolution cair,
  site e back office seguem operando; na migração para a Meta oficial, apaga-se o
  stack e trocam-se as variáveis.
- **Sem Railway/serviço externo**: tudo na VPS — banco, app e agente no mesmo host
  elimina latência, ponto de falha e custo extra; mantém o padrão de deploy atual
  (git tag → docker compose up).
- Migrações continuam idempotentes no boot (✅ padrão atual).
- Credenciais Meta/SMTP em `.env` local (nunca no repo — público).

---

## 8. Sequência de releases sugerida (mapeia ondas do PRODUTO.md)

| Release | Escopo | Depende de |
|---|---|---|
| **v1.5.0** — fundação ⬅ próxima | Extração do `brain/` (parser vira pacote), tabelas novas (funcionários+hierarquia, sessões, política_versoes), SMTP, adapter `WHATSAPP_PROVIDER=evolution`, agente com onboarding conversacional (convite wa.me → confirmação → declaração → veículo) | Evolution instalado na VPS (usuário) + SMTP |
| **v1.6.0** — admin limpo + convites ✅ (D-012) | Navegação agrupada, Equipe com colaboradores + convite-isqueiro (wa.me/SMTP) | v1.5.0 |
| **v1.7.0** — motor ⬅ próxima | OCR provider, fluxo de despesa pelo WhatsApp, decisor (aprova/reprova citando regra — **só com regra explícita**, D-013), fila de revisão manual no web, push de aviso | v1.6.0 |
| **v1.8.0** — dossiê | kit zip 1-botão com regra citada + versão da política por despesa | v1.7.0 |
| ~~**v1.9.0** — política viva~~ | ⛔ **cancelada (D-013)** — sistema nunca altera a política | — |
| **v1.9.0** — escala | upload em lote de funcionários, lembretes automáticos, painel caixa-de-entrada | qualquer ponto após v1.7.0 |

Ordem pensada por valor-desbloqueio: sem onboarding conversacional não há despesa pelo
WhatsApp; sem motor não há revisões; sem revisões resolvidas o dossiê sai incompleto.

---

## 9. Riscos/abertos técnicos

1. **Qualidade do OCR de cupom** — fotos ruins caem hoje em preenchimento assistido
   (motor fiscal, web). No reembolso (D-014), **ninguém preenche nada**: o que não deu
   para ler vira `REVISAO_MANUAL` do gestor sobre a evidência. Medir taxa de fallback.
2. **Janela de 24h da Meta** — só se aplica na migração futura para a API oficial;
   no piloto (Evolution) não há essa restrição. Mesmo assim, manter lembrete por
   e-mail como hábito do desenho.
2b. **Risco do Evolution (não-oficial)** — banimento do número ou quebra de protocolo.
   Mitigação: número dedicado ao produto, volume de piloto, adapter isolado que permite
   trocar de provider sem tocar no produto.
3. **Decisor conservador por construção (D-013)** — só aprova com regra explícita;
   qualquer dúvida material vira revisão manual. Uma devolução a mais custa um clique
   do gestor; uma falsa aprovação custa uma glosa.
4. ~~**Contador: destinatário ou usuário?**~~ **decidido (D-016, 29/08): destinatário** —
   zip 1-botão com link temporário; `dossies` é arquivo gerado + checksum +
   destinatário, não portal. Portal de escritório, se um dia fizer sentido, é
   produto separado.

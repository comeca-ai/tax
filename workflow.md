# Workflow de desenvolvimento do reembolsa.ia

Como uma demanda sai do pedido do dono e chega em produção — quem são os agentes,
onde eles moram, o que cada um entrega e onde o dono é consultado.

Estado deste documento: **28/08/2026**. Descreve o que existe hoje na máquina,
não um plano.

---

## 1. O papel de cada um

| Papel | Quem executa | Entrega |
|---|---|---|
| **Gerente de desenvolvimento** | a sessão principal do Claude Code (eu) | brief, portões com o dono, consolidação, commit/push, deploy, relatório final |
| `especificador` | subagente | spec implementável — arquivos, contratos, comportamento, casos de borda, testes, o que NÃO muda |
| `designer` | subagente | desenho da experiência — layout desktop/375px, hierarquia, estados, textos literais, componentes shadcn existentes |
| `desenvolvedor` | subagente, em **worktree isolado** | código + testes vitest + `tsc -b`, no estilo do código existente |
| `qa-codigo` | subagente | revisão adversarial do diff: correção, regressão, contratos, segurança multi-tenant, domínio (D-013/D-014) |
| `qa-visual` | subagente | validação de tela ou, sem navegador, roteiro de verificação manual numerado |
| `gerente` | subagente — **existe mas o pipeline não chama** | definição de escopo/risco; hoje esse papel é feito pela sessão principal no Passo 1 |

Todos operam no padrão **AAA** declarado no `SKILL.md`: sênior, específico,
verificável. "Bom o suficiente" volta para o autor com o achado.

---

## 2. Onde os arquivos moram

```
apps/reembolsa/
├── .claude/                      ← TUDO AQUI É GITIGNORED (.gitignore:34)
│   ├── skills/reembolsa/
│   │   ├── SKILL.md              ← o playbook do gerente (passos 0–6 e portões)
│   │   └── workflow.js           ← o script do pipeline (Workflow tool)
│   ├── workflows/
│   │   └── reembolsa-demanda.js  ← cópia byte a byte de workflow.js
│   ├── agents/*.md               ← cópia local das 6 definições de agente
│   └── worktrees/                ← onde o código novo nasce
└── workflow.md                   ← este arquivo (versionado)

~/.claude/skills/reembolsa  →  symlink para apps/reembolsa/.claude/skills/reembolsa
~/.claude/agents/*.md          6 agentes (fonte canônica das definições)
```

Consequência prática: **o pipeline não está no repositório**. Quem clonar o
`tax.git` não leva os agentes nem o skill — só este documento. As duas cópias do
script (`skills/reembolsa/workflow.js` e `workflows/reembolsa-demanda.js`) estão
idênticas hoje; se uma for editada, a outra fica defasada em silêncio.

---

## 3. O gatilho

O dono digita:

```
/reembolsa "descrição da mudança"
```

Isso carrega `SKILL.md`, que põe a sessão principal no papel de gerente. Fora
desse gatilho — pedido em linguagem normal, como "habilite o convite de
usuários" — a sessão principal conduz a demanda **sem** disparar o pipeline de
subagentes; ela mesma investiga, implementa em worktree e reporta.

---

## 4. Os 6 passos e os 4 portões

```
Passo 0  Pré-condições (leitura)         git status · credencial de push · docker ps + curl
   │                                     PORTÃO 0 — árvore suja: commitar / seguir / abortar
Passo 1  Brief do gerente (≤15 linhas)   objetivo · dentro · fora · riscos · pronto · decisões
   │                                     PORTÃO 1 — aprovar / ajustar / abortar
Passo 2  Workflow (subagentes)
   │  ├─ Spec      especificador          → se vier "PENDÊNCIA DE DECISÃO", para aqui
   │  │                                     PORTÃO 2 — dono decide; retoma com resumeFromRunId
   │  ├─ Design    designer                (roda SEMPRE — decisão do dono, 23/08)
   │  ├─ Dev       desenvolvedor           worktree isolado + vitest + tsc
   │  ├─ Revisão   qa-codigo ⇄ dev         até 2 rodadas; achado "cosmetico" não devolve
   │  └─ QA        qa-codigo + qa-visual   em paralelo
Passo 3  Consolidação                    diff, testes, achados por gravidade, riscos
   │                                     PORTÃO 3 — aplicar e publicar / corrigir X / descartar
Passo 4  GitHub                          patch na árvore · CHANGELOG + package.json · commit · tag · push
Passo 5  Plataforma                      .env + docker-compose · up -d --build tax-app · logs · 2 curls
Passo 6  Relatório único + memória        o que mudou, versão, estado do container, o que ficou de fora
```

Nada de "quer que eu…?" fora dos portões. Dentro deles, `AskUserQuestion`.

---

## 5. Como o script conduz os subagentes

`workflow.js` (173 linhas) roda as 5 fases acima com saída **estruturada por
schema** — cada agente devolve JSON, não prosa, para o orquestrador:

- `SPEC_SCHEMA` — arquivos, contratos, comportamento, casosDeBorda, naoMuda,
  rfImpactadas, **pendenciasDeDecisao**, specCompleta.
- `DEV_SCHEMA` — worktree, resumoPorArquivo, testes, typecheck, diffStat, bloqueio.
- `REVISAO_SCHEMA` — lista de achados `{arquivoLinha, oQueQuebra, cenario, gravidade}`
  + veredito. Gravidade ∈ *bloqueia* / *corrige-antes-de-mergear* / *cosmetico*.
- `VISUAL_SCHEMA` — estados, mobile, textos, roteiro manual.

O laço de revisão devolve ao dev só os achados **não cosméticos**; na 2ª rodada
sem convergência, escala para o gerente em vez de insistir.

Todo prompt de agente carrega o bloco `REGRAS`:

> `/home/jhonata_emerick/apps/reembolsa` é PRODUÇÃO. Nunca editar lá, nunca
> `docker`, migração, `npm install`, `git commit/push/checkout/stash/reset`.
> Leitura é livre. Nunca ler nem citar valores do `.env`. Responder em pt-BR.

---

## 6. Regras que valem para todo mundo

Vêm do `CLAUDE.md` do servidor e são inegociáveis:

1. A árvore `apps/reembolsa` é **produção no ar**. Código novo nasce em worktree
   e só entra na árvore no Portão 3, com "ok" do dono.
2. Nunca `docker compose down -v`; nunca mexer no serviço `db` nem no volume
   `db_data`; migração só com o dono sabendo se é reversível.
3. Segredos do `.env` não aparecem em relatório, commit, prompt de agente ou chat.
4. Ao encontrar problema fora do escopo: **relatar e propor**, não corrigir.
5. `auditLogs` é append-only — nunca `UPDATE`/`DELETE`.

---

## 7. Onde isso costuma emperrar

- **Worktrees acumulam.** Cada run cria uma; hoje há 8 penduradas
  (`git worktree list`), várias em cima de commits antigos. Limpar faz parte do
  fim da demanda, não sobra para depois.
- **Testes não rodam no host.** Não há `node_modules` na árvore; vitest/tsc/eslint
  só dentro do container, com `NODE_PATH` apontando para o do container.
- **O dono valida no navegador pelo domínio.** Enquanto o DNS estiver defasado
  (IP externo efêmero da VM), o QA visual só entrega roteiro manual — e o roteiro
  precisa ser executável por túnel SSH, não pelo domínio.
- **Sem gerente no script.** O agente `gerente` existe em `.claude/agents/` mas o
  `workflow.js` não o invoca; se o brief precisar de rigor extra, é a sessão
  principal que faz.

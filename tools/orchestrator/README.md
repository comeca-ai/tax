# Orquestrador de auditoria (reembolsa_motor)

Varredura estruturada do repositório: branches, entidades, funcionalidades,
integrações (OCR, WhatsApp, e-mail, Receita), telas e histórico relevante.

## Uso

```bash
pnpm install
pnpm audit:run
```

Os relatórios são gravados em `docs/auditoria/`:

| Arquivo | Conteúdo |
| --- | --- |
| `01-branches.md` | Branches locais/remotas conhecidas pelo clone |
| `02-entidades.md` | Tabelas Drizzle declaradas em `db/schema.ts` |
| `03-funcionalidades.md` | Routers tRPC montados em `api/router.ts` e contagem de procedures |
| `04-integracoes.md` | Sinais lexicais de integração por domínio |
| `05-telas.md` | Rotas do frontend em `src/App.tsx` (públicas/protegidas) |
| `06-historico.md` | Commits do domínio de reembolso |
| `audit-summary.json` | Resultado agregado em JSON |

O panorama multi-repositório (comeca-ai) com versionamento e complexidade
está em `docs/auditoria/00-repositorios.md`.

## Estrutura

```
tools/orchestrator/
  run-audit.ts          # runner (entrada do pnpm audit:run)
  types.ts              # contratos dos itens de auditoria
  scanners/             # branches, entities, features, integrations, screens, history
  reporters/markdown.ts # geração dos relatórios
  utils/                # fs, git, markdown
```

## Convenções

- Scanners são funções puras sempre que possível (`parse*`, `detect*`,
  `filter*`) — o I/O fica isolado nos wrappers `scan*`, o que mantém os
  testes unitários sem filesystem nem git.
- Os relatórios são gerados; não edite `docs/auditoria/*.md` manualmente
  (exceto `00-repositorios.md`, que é curadoria estática).

## Testes

```bash
pnpm test tools/orchestrator
```

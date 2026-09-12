# Governança do repositório

Este documento define como o código do reembolsa.ia é colaborado, revisado e
liberado. Ele complementa a arquitetura em `docs/ARQUITETURA.md` e o runbook
em `docs/DEPLOY.md`.

## Objetivo

Permitir que novos parceiros contribuam com segurança, mantendo uma história
auditável: cada mudança deve ter contexto, revisão, validação automática e
uma versão que possa ser recuperada.

## Fluxo de trabalho

```
Issue ou decisão → branch curta → pull request → checks verdes + revisão
→ merge na main → tag SemVer → deploy → validação pós-deploy
```

`main` é a única linha de integração. Não manteremos uma branch permanente de
`develop`, pois ela cria divergência entre o que foi integrado e o que será
publicado.

## Regras da main

Quando o novo repositório estiver criado, configure as regras de proteção:

1. bloquear push e force-push diretos;
2. exigir PR para merge;
3. exigir uma aprovação; duas para áreas sensíveis;
4. exigir os checks `typecheck`, `lint`, `test` e `build`;
5. exigir branches atualizadas antes do merge;
6. bloquear merge quando houver conversa pendente.

Áreas sensíveis: `api/auth/`, `api/routers/auth.ts`, permissões, regras
fiscais, `db/migrations/`, integrações de cobrança/mensageria e qualquer
mudança que processe dados pessoais.

## Donos por área

Os responsáveis nominais serão definidos quando os parceiros entrarem. Até
lá, o PR deve solicitar revisão conforme a área alterada:

| Área | Escopo | Revisão necessária |
|---|---|---|
| Produto e interface | `src/` | pessoa responsável por produto/UI |
| API e permissões | `api/`, `contracts/` | responsável técnico de backend |
| Dados | `db/schema.ts`, `db/migrations/`, `db/seed.ts` | responsável técnico + responsável por dados |
| Regras fiscais | motor, matriz e memórias de cálculo | responsável técnico + especialista tributário |
| Operação | `docs/DEPLOY.md`, Docker e variáveis | responsável por infraestrutura |

Depois da definição dos responsáveis, esta matriz deve virar `CODEOWNERS`.

## Definição de pronto

Uma alteração está pronta para merge quando:

- escopo e impacto estão descritos no PR;
- testes relevantes foram criados ou atualizados;
- `check`, `lint`, `test` e `build` passam;
- o fluxo manual afetado foi exercitado;
- migração, segurança, LGPD e documentação foram avaliadas quando aplicável;
- existe plano de reversão para alteração de risco elevado;
- o PR foi revisado e não há comentários pendentes.

## Banco e dados

Migrações são patrimônio histórico: não reescreva arquivos já publicados e
nunca use comandos destrutivos contra produção. Mudanças devem ser aditivas,
revisadas e testadas antes do deploy. Segredos permanecem exclusivamente no
gerenciador de segredos ou no `.env` local/servidor, nunca no Git.

## Releases

Cada release recebe uma tag anotada `vX.Y.Z`, uma entrada no `CHANGELOG.md` e
uma validação pós-deploy conforme `docs/DEPLOY.md`. Se houver incidente, o
rollback é a tag anterior; alterações de dados exigem o procedimento previsto
na própria migração.

## Adoção em etapas

1. Consolidar a refatoração pendente em uma branch e PR próprios.
2. Corrigir a linha de base de lint e validar o build de produção.
3. Adicionar CI no GitHub e só então tornar seus checks obrigatórios.
4. Criar `CODEOWNERS`, templates de issues/PR e regras de proteção.
5. Publicar a primeira release a partir do novo repositório.

O detalhamento da linha de base atual está em
`docs/BASELINE-DE-QUALIDADE.md`.

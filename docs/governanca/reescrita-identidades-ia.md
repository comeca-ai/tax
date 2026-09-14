# Reescrita manual de identidades de IA no histórico git

## Objetivo

Este procedimento existe por governança e segurança: manter o histórico sem identidades de ferramentas de IA em autoria (`author`/`committer`) e trailers (`Co-authored-by`), consolidando para **Emerick**.

## Como executar no GitHub Actions

1. Acesse **Actions** no repositório.
2. Selecione o workflow **Reescrever identidades de IA no histórico**.
3. Clique em **Run workflow**.
4. Preencha:
   - `confirm`: `REWRITE` (obrigatório, exato).
   - `branch`: branch alvo (padrão `main`).
   - `dry_run`: rode primeiro com `true`.
   - `target_email`: opcional, para sobrescrever o e-mail final de Emerick.
5. Execute primeiro em modo de simulação (`dry_run=true`) e revise o resumo gerado.
6. Para aplicar de fato, execute novamente com `dry_run=false`.

## Consequências da reescrita

- Os SHAs dos commits mudam.
- Assinaturas **Verified** são perdidas.
- PRs abertos precisarão de rebase/atualização.
- Clones locais devem sincronizar com hard reset:

```bash
git fetch origin
git reset --hard origin/main
```

## Permissões e branch protegida

A etapa de push usa `--force`. Se a branch protegida não permitir force-push pelo `github.token`, configure o secret **`HISTORY_REWRITE_TOKEN`** com um PAT que tenha permissão de bypass temporário para a branch protegida.

# Como contribuir

Este repositório usa a `main` como linha sempre publicável. Toda alteração
entra por pull request (PR); não faça push direto nela.

## Antes de começar

1. Leia o README e os documentos em `docs/` relacionados à área em que vai
   trabalhar.
2. Crie uma branch a partir da `main` atualizada.
3. Nunca versione `.env`, chaves de API, dumps de banco, uploads reais ou
   informações da infraestrutura de produção.

## Convenção de branches

Use nomes curtos, em minúsculas e separados por hífen:

```
feat/consulta-cnpj
fix/sessao-expirada
refactor/modulo-empresas
docs/guia-de-deploy
chore/atualiza-dependencias
```

Cada branch deve tratar de um único objetivo. Refatorações e alterações de
comportamento devem ficar em PRs distintos sempre que isso for viável.

## Desenvolvimento e validação

Instale dependências e configure um `.env` local a partir do modelo aprovado
pelo time. Para validar uma mudança, execute:

```bash
npm run check
npm run lint
npm test
npm run build
```

Além das verificações automáticas, teste manualmente o fluxo afetado. Para
mudanças de banco, teste a migração em uma base descartável e confirme que a
migração é aditiva, idempotente e possui rollback documentado quando cabível.

## Commits

Prefira commits pequenos, reversíveis e com intenção clara:

```
feat(empresas): separa cadastro no módulo de empresas
fix(auth): impede aceite de convite expirado
docs(deploy): esclarece rollback por tag
```

Evite commits genéricos como `ajustes`, `wip` ou misturar formatação,
refatoração e mudança de regra de negócio no mesmo commit.

## Pull requests

Um PR deve explicar o problema, a solução, o impacto em dados e como foi
validado. Quem abriu o PR corrige os apontamentos; quem revisa verifica tanto
o código quanto o comportamento e a documentação.

Para mudanças que afetam cálculo tributário, autenticação, autorização,
dados pessoais, integrações externas ou migrações, a revisão de uma segunda
pessoa é obrigatória antes do merge.

## Versionamento e releases

Usamos SemVer: `MAJOR.MINOR.PATCH`.

- `PATCH`: correção compatível;
- `MINOR`: funcionalidade compatível;
- `MAJOR`: quebra de compatibilidade.

Produção é liberada por tag (`vX.Y.Z`), com entrada correspondente no
`CHANGELOG.md`. Nunca promova uma branch diretamente para produção.

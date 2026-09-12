# Linha de base de qualidade

Data da verificação: 2026-09-12.

Este registro separa o que foi efetivamente validado do que ainda precisa ser
resolvido antes de tornar os controles obrigatórios no GitHub.

| Comando | Resultado | Observação |
|---|---|---|
| `npm run check` | passa | TypeScript compilou sem erros. |
| `npm test` | passa | 31 arquivos e 431 testes aprovados. |
| `npm run lint` | falha | 21 erros a corrigir. |
| `npm run build` | passa | Artefato de produção gerado com sucesso. |

## Situação do diretório de trabalho

Há uma refatoração não versionada que move o domínio de empresas para
`api/modules/empresas/` e `src/modules/empresas/`. Ela envolve arquivos de
API, contratos, telas e testes. Antes de migrar para o novo repositório, deve
ser revisada, testada e registrada numa branch/PR exclusiva.

Também há um apontamento de whitespace em `contracts/types.ts` detectado por
`git diff --check`.

## Critério para encerrar esta linha de base

1. Revisar e commitar a refatoração de empresas separadamente.
2. Corrigir os erros de lint, sem suprimir regras como atalho.
3. Criar o workflow de CI usando os quatro comandos desta página.
4. Tornar os checks obrigatórios na `main` somente depois de estarem verdes.

Os erros de lint devem ser tratados em PR(s) focados. Alguns estão em código
anterior à refatoração; outros pertencem ao módulo de empresas. Separá-los
evita esconder regressões e torna a revisão objetiva.

## Segurança antes da migração

Antes de conceder acesso a parceiros ou publicar o novo repositório, execute
uma revisão de segredos no estado atual e no histórico que será migrado.
Rotacione qualquer chave que tenha sido usada fora do ambiente local, mesmo
que ela já tenha sido removida do código.

As credenciais exibidas no README são estritamente dados de demonstração. Elas
não podem existir, nem funcionar, em homologação ou produção. O processo de
deploy deve usar segredos próprios e uma base sem contas previsíveis.

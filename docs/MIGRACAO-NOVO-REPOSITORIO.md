# Migração para o novo repositório GitHub

Este checklist evita perder histórico, publicar segredos ou deixar o novo
repositório sem regras de colaboração.

## Antes do primeiro push

1. Crie o repositório inicialmente como **privado** e vazio. Não inclua README,
   `.gitignore` ou licença pela interface; o projeto já possui esses arquivos.
2. Defina o nome e a organização proprietária. A licença é uma decisão de
   negócio: ela só será adicionada depois que o time decidir se o código será
   fechado, permissivo ou terá outro modelo de distribuição.
3. Revise os arquivos rastreados e o histórico que será levado. Nenhum `.env`,
   token, senha, dump de banco, upload real, endereço de infraestrutura ou
   dado pessoal pode entrar no Git.
4. Confirme que a refatoração em andamento foi separada em uma branch/PR ou
   que ficará fora da primeira importação. Não misture a migração do repositório
   com uma alteração funcional em aberto.
5. Confira que a documentação de operação não expõe domínios administrativos,
   IPs, chaves ou topologia interna.

## Configuração no GitHub

Após o primeiro push, configurar:

1. proteção da `main`, conforme `docs/GOVERNANCA-DE-REPOSITORIO.md`;
2. times de acesso pelo menor privilégio necessário;
3. labels iniciais: `bug`, `enhancement`, `documentation`, `security`,
   `blocked`, `good first issue`;
4. templates de issue e PR já incluídos em `.github/`;
5. workflow de CI depois que a linha de base de lint e build estiver verde;
6. `CODEOWNERS` depois de definidos os responsáveis nominais;
7. Dependabot e alertas de segurança, conforme a política da organização.

## Primeiro marco versionado

O primeiro marco no novo repositório não deve ser chamado apenas de
"importação". Ele deve registrar o estado funcional importado, a referência
à versão anterior e os resultados da validação. Exemplo de tag:

```
v1.13.0-migrated.1
```

Depois da estabilização, as releases voltam ao padrão `vMAJOR.MINOR.PATCH`.

## Informação necessária para conectar o repositório

Quando ele estiver criado, envie somente a URL Git do repositório (HTTPS ou
SSH). Não envie token, senha ou chave privada. A autenticação deve ocorrer
pelo mecanismo seguro já configurado na máquina ou por um token criado por
você com a menor permissão necessária.

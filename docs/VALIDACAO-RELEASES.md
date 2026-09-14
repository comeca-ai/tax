# Validação de releases

Este documento guarda a evidência de qualidade que antecede uma tag. A tag só
é criada após aceite funcional e autorização de publicação; validação local
ou CI verde não publica a aplicação por si só.

## Próxima release — interface operacional

**Origem:** merge do PR #6 na `main` (`fa92866`).

**Escopo:** atualização visual das telas Visão geral, Fila de revisão, Detalhe
de despesa e Política. Não altera regras de aprovação, permissões, migrações
ou a página inicial.

### Evidências técnicas — 2026-09-12

- `npm run lint`: aprovado;
- `npm run check`: aprovado;
- `npm test`: 33 arquivos e 435 testes aprovados;
- `npm run build`: aprovado.

### Aceite e promoção pendentes

- [ ] Conferência visual dos quatro fluxos por responsável de produto;
- [ ] Conferência manual de autenticação, empresa ativa e revisão de uma
      despesa em homologação;
- [ ] Definição da versão SemVer (sugestão: `v1.14.0`, por conter melhoria
      visual compatível);
- [ ] Changelog final revisado;
- [ ] Tag criada no commit exato aprovado;
- [ ] Backup verificável antes de qualquer migração ou alteração de dados;
- [ ] Deploy da tag, health check e registro do resultado.

### Observações não bloqueantes

- O build alertou que a base de dados do Browserslist está defasada. A
  atualização deve ser tratada em PR de manutenção, com lockfile revisado.
- O JavaScript inicial possui chunk acima de 500 kB compactado. A divisão por
  rota deve ser planejada e medida em PR de performance, sem misturar com a
  release visual.

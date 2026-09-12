# Política de release e deploy

## Princípio

Produção recebe somente um **artefato imutável**, identificado por uma tag
SemVer (`vMAJOR.MINOR.PATCH`) e aprovado. Branches não são ambientes de
produção: nem `main`, nem uma branch de feature, nem um PR em draft podem ser
publicados diretamente.

Esta política traz para o estágio atual do reembolsa.ia.br práticas usadas por
times de engenharia maduros: integração contínua, revisão obrigatória,
promoção explícita entre ambientes, configuração fora do código e rollback
previsível.

## Ambientes

| Ambiente | Finalidade | Origem permitida | Dados |
|---|---|---|---|
| Local | desenvolvimento individual | qualquer branch | dados fictícios/descartáveis |
| Homologação | validação integrada e aceite | release candidate | dados anonimizados ou sintéticos |
| Produção | usuários reais | tag de release aprovada | dados reais, acesso mínimo |

Cada ambiente tem seu próprio banco, URLs e segredos. Produção jamais usa o
`.env` de desenvolvimento, contas seed previsíveis ou uma chave de teste.

## Caminho de uma mudança

```
Issue → branch curta → PR → CI verde + revisão → merge na main
→ tag/release candidate → homologação + aceite → tag de produção
→ deploy controlado → health check e monitoramento
```

O primeiro estágio da operação poderá combinar etapas manuais com evidências
registradas no PR e na release. À medida que a equipe amadurecer, o pipeline
de CI/CD passa a executar a promoção e a coleta dessas evidências.

## Requisitos para uma release

Antes da tag de produção, é obrigatório:

1. PR aprovado, sem conversas pendentes e com histórico rastreável;
2. CI verde: type-check, lint, testes, build e verificações de migração;
3. testes de integração para os fluxos críticos disponíveis;
4. teste de aceite em homologação para a funcionalidade alterada;
5. `CHANGELOG.md` atualizado com impacto e instrução de rollback;
6. revisão adicional para autorização, regras fiscais, dados pessoais,
   migrações ou integrações externas;
7. versão SemVer definida e tag criada a partir do commit exato aprovado.

Enquanto um requisito ainda não estiver automatizado, ele precisa ser marcado
e evidenciado manualmente no PR. Exceções exigem registro explícito, dono,
prazo de correção e aprovação do responsável técnico.

## Deploy de produção

1. Registrar a tag e o commit de origem da release.
2. Criar backup verificável do banco quando houver alteração de dados ou
   migração.
3. Aplicar o mesmo artefato validado em homologação; nunca recompilar código
   diferente no servidor de produção.
4. Aplicar migrações compatíveis e observáveis. Preferir o padrão expandir →
   migrar dados → contratar, que permite voltar a versão da aplicação sem
   quebrar o banco.
5. Reiniciar de forma controlada e testar `/api/health`, autenticação e o
   fluxo funcional afetado.
6. Registrar resultado, horário, responsável e versão implantada na release.

O deploy não deve exigir editar arquivos de código manualmente no servidor.
Segredos e configuração de ambiente ficam fora do Git e são injetados pelo
ambiente de deploy.

## Rollback

Um rollback volta para a última tag de produção conhecida como saudável. Ele
deve ser executado quando health check, métricas ou teste funcional falharem
após o deploy.

Migrações não são simplesmente apagadas em produção. Se uma mudança de schema
for incompatível, o rollback exige procedimento próprio, revisado e testado.
Por isso alterações de banco devem ser compatíveis com pelo menos uma versão
anterior da aplicação durante a janela de retorno.

## Segurança operacional

- acesso de deploy é por chave ou token dedicado, com menor privilégio;
- contas humanas usam autenticação forte e nunca compartilham credenciais;
- chaves podem ser revogadas e rotacionadas sem alterar código;
- a aplicação recebe tráfego público somente por HTTPS;
- logs de deploy não contêm segredos, documentos fiscais ou dados pessoais;
- `main` e tags de produção têm proteção contra force-push.

## Papéis

| Papel | Responsabilidade |
|---|---|
| Autor | implementa, testa e descreve o impacto no PR |
| Revisor | verifica código, testes, segurança e regra de negócio |
| Responsável técnico | aprova exceções e autoriza release técnica |
| Responsável de produto | aceita comportamento e impacto de negócio |
| Operação | executa/acompanha deploy e rollback conforme runbook |

Em times pequenos, uma pessoa pode exercer mais de um papel, mas não deve
aprovar sozinha uma alteração sensível que ela mesma produziu.

## Evolução do processo

O próximo incremento é criar GitHub Actions para os gates obrigatórios e um
ambiente de homologação. Depois, o deploy de tags aprovadas deve ser feito por
CI/CD com aprovação de ambiente, em vez de acesso manual ao servidor.

# Revisão técnica independente do candidato — 14/09/2026

Responsável: agente IA Codex `revisao_candidato`, em frente independente da implantação. Esta é revisão automatizada assistida por leitura de código; não representa revisão humana, aceite de negócio ou comprovação de implantação.

Base Git observada: `1eab6fee72cbe65985383a3b917e1bed321610a2`, com alterações locais ainda não commitadas. Escopo: S1–S5, S9, S10 e E5 (importação de equipe por lote). Nenhum código da aplicação foi modificado por esta revisão.

## Resultado

Não foi identificado bloqueante novo de autorização, exposição de dados ou gravação parcial no código revisado. A recomendação técnica é prosseguir para a homologação já autorizada, condicionada às verificações operacionais abaixo. Não há afirmação de que a POC completa passou em aceite ponta a ponta.

### Condição de publicação encontrada

`api/routers/auth.ts:60` mantém o comportamento anterior de conceder perfil `admin` ao primeiro cadastro em banco vazio. Como S1 deixa de criar contas demo por padrão, uma instalação nova aberta ao público pode atribuir administração da plataforma a um visitante. Antes de abrir tráfego, o responsável pela implantação deve comprovar que o banco de homologação já contém administrador controlado; na ausência dele, interromper a publicação pública e provisionar o bootstrap por acesso restrito. O coordenador informou que o destino é uma homologação existente e incorporará essa checagem ao preflight; esta frente não consultou o banco remoto.

Outras condições já decorrentes da mudança: migrações 0019 e 0020 aplicadas antes de iniciar o candidato; `APP_SECRET` explícito; nova configuração `WHATSAPP_SERVICE_TENANT_TOKENS` válida; `SEED_DEMO` desativado no processo publicado. Cookies antigos precisam de novo login. A retirada do seed demo não desativa contas antigas nem revoga suas senhas; a situação dessas contas requer verificação no destino.

## Evidência de leitura

| Área | Verificação e conclusão |
| --- | --- |
| S1/S4 | `db/seed-policy.ts` exige consentimento e senha externa em development/test; produção recusa demo. `docker-entrypoint.sh` não ignora falha de seed. `api/lib/env.ts` recusa chave de sessão vazia em todos os ambientes. |
| S2 | `api/auth/session.ts` inclui nonce e revisão HMAC opaca da credencial. `api/context.ts` verifica denylist e credencial corrente sem devolver hash. `api/auth/revogacao.ts` persiste revogação antes da limpeza do cookie. Reset e troca de senha compartilham lock do usuário e invalidam links transacionalmente. |
| S3/S10 | `api/auth/rateLimit.ts` usa transação e contador durável, limitando antes de consultas sensíveis nas rotas. Logs de recuperação em `api/routers/auth.ts` e `api/mail/mailer.ts` omitem token e erro bruto do transporte. |
| S5 | `api/boot.ts:41` monta middleware da nova configuração de tokens por empresa; configuração inválida fecha acesso. Identificação filtra empresa no SQL; comprovante recusa empresa divergente e valida vínculo ativo. Não há fallback HTTP para a lista global antiga. |
| S9 | `api/routers/_shared.ts` e listagem de empresas exigem vínculo ativo para não proprietários sem papel admin; revisor deixa de possuir acesso global. Designação de pessoa desligada não mantém permissão de revisão. |
| E5 | `api/routers/equipeLote.ts` autoriza antes de ler/gravar. Prévia assinada vincula usuário, empresa, arquivo e expiração. Confirmação trava empresa, revalida cadastro, grava pessoas, superior, lote e auditoria na mesma transação. Repetição usa chave durável por token. Convites dependem de opção explícita e só são processados após commit. |
| E5/dados | `contracts/equipeLote.ts` limita lote a 100, valida E.164, duplicação de telefone/matrícula, superior ativo e ciclos internos. `db/equipeSchema.ts` e migração 0020 definem chave idempotente e FK de empresa; superior usa FK composta de tenant em colaboradores. |

## Testes executados nesta frente

Em 14/09/2026, início às 01:33:25 UTC: **75 testes passaram em 11 arquivos**, sem pulos ou falhas, duração de 4,51 segundos.

```sh
npm test -- api/auth/session.revogacao.test.ts api/context.revogacao.test.ts api/routers/auth.seguranca.test.ts api/lib/env.test.ts db/seed-policy.test.ts api/modules/reembolso/whatsapp/servicoAuth.test.ts api/modules/reembolso/whatsapp/identificacao.test.ts api/modules/reembolso/whatsapp/comprovanteRouter.test.ts api/routers/equipeLote.test.ts contracts/equipeLote.test.ts api/middleware.erros.test.ts
```

Os testes focais exercitam invalidação de sessão, limitação prévia de autenticação, ausência de vazamento de reset, configuração de tenant, rejeição de troca de empresa, validação de CSV, token ligado ao conteúdo e repetição de lote. A integração SQL de E5 foi lida, mas não executada por esta frente. O coordenador reportou separadamente 745 testes aprovados/20 pulados na suíte geral e 23 testes SQL aprovados; esse resultado não é reapresentado aqui como execução independente.

## Limites do parecer

E5 recebe CSV UTF-8 exportado da planilha, não arquivo XLSX nativo. A confirmação pode devolver estados de convite que exigem revisão; persistir equipe não comprova entrega de mensagem. Repetição depende de token da prévia ainda válido (30 minutos). Não foram executados chamadas externas, envio de e-mail/WhatsApp, deploy, teste com número real, inspeção de contas remotas ou aceite do usuário. Estes passos pertencem à integração e homologação coordenadas.

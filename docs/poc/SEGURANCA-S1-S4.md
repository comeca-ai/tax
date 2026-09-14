# Correções locais de segurança S1 e S4

Data: 2026-09-13. Responsável técnico: Codex, agente IA `pilares_interface`.
Estado: alteração local, sem commit ou implantação por esta frente.

## S1 — Dados demo no boot

Antes, `docker-entrypoint.sh` executava `db/seed.ts` em todo boot e o seed criava contas demo com senhas constantes, incluindo perfil administrador. Falhas do seed eram ignoradas.

Agora, a inicialização mantém apenas a matriz de regras e as configurações estruturais idempotentes por padrão. A criação de usuários, empresa e política demo depende das três condições:

- `NODE_ENV` explicitamente igual a `development` ou `test`;
- `SEED_DEMO=true`;
- `SEED_DEMO_PASSWORD` fornecida externamente, com pelo menos 12 caracteres não reduzidos a espaços.

As três senhas literais foram removidas do código do seed. Não existe senha demo padrão. A senha fornecida só é usada na criação de novas contas demo; contas já existentes não têm senha alterada pelo seed.

`NODE_ENV=production`, ausente ou outro ambiente rejeita a autorização de demo. A guarda executa antes da conexão com o banco. O entrypoint não ignora falha de seed: uma configuração inválida interrompe o boot. Execução direta do arquivo seed também passa pela guarda.

**Limite da correção:** contas demo anteriormente criadas continuam no banco, e credenciais antigas continuam no histórico Git. Esta alteração não revoga contas, sessões ou senhas existentes, nem reescreve histórico. A inspeção e desativação dessas contas no ambiente publicado precisam ser executadas e comprovadas separadamente.

## S4 — Chave vazia de sessão

Antes, `api/lib/env.ts` rejeitava `APP_SECRET` ausente apenas em produção. Fora desse modo, a assinatura podia usar string vazia.

Agora, `APP_SECRET` ausente, vazio ou composto só de espaços é rejeitado em todos os ambientes. Não foi introduzido bypass por ambiente de teste. A configuração do Vitest já fornece chave sintética explícita. Valores configurados são preservados sem trim para não alterar assinaturas existentes.

**Limite da correção:** a validação garante ausência de chave vazia, não mede entropia nem revoga uma chave exposta. Rotação de chave no servidor e revogação de sessões não foram feitas por esta frente. S2 é tratado separadamente pelo agente `pilares_cadastro`.

## Validação

- `db/seed-policy.test.ts`: negação por padrão; produção e ambientes desconhecidos não autorizam demo; senha explícita exigida; consentimento exato; desenvolvimento/teste autorizado.
- Verificação adicional pelo comando real de seed, fora do runner Vitest, com dados sintéticos e destino de banco inacessível: saiu com código 1 e mensagem da guarda de produção, antes de iniciar seed. A senha não apareceu no erro.
- `api/lib/env.test.ts`: chave ausente/branca rejeitada em produção, desenvolvimento, teste e ambiente indefinido; preservação da chave configurada; erro sem divulgação da entrada.
- Os testes usam dados sintéticos. Nenhum banco de produção ou credencial real foi consultado.

Essas evidências sustentam correção local. A implantação e validação do boot no servidor permanecem necessárias para marcar os achados como corrigidos em produção.

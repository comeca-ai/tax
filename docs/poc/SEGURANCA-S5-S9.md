# Segurança S5/S9 — integração por empresa e revogação de vínculo

Implementação local de 13/09/2026. Este documento registra comportamento e validação, não comprova implantação em produção.

## S5 — credencial de serviço limitada à empresa

A API HTTP `/api/v1/*` passa a autenticar somente `WHATSAPP_SERVICE_TENANT_TOKENS`, contendo um array JSON de objetos com `token` e `empresaId`. Cada token identifica exatamente uma empresa. O token precisa ter entre 32 e 4096 caracteres, sem espaços. Para rotação, cadastrar temporariamente dois tokens diferentes para a mesma empresa e retirar o anterior depois da migração do consumidor.

Configuração ausente, JSON inválido, empresa inválida, campos desconhecidos, token curto ou token duplicado invalidam toda a configuração. `WHATSAPP_SERVICE_API_TOKENS`, a lista global anterior, não é fallback. Nenhum valor de credencial é registrado em resposta ou log.

O middleware fixa a empresa no contexto da requisição. A identificação por telefone já filtra a empresa no SQL e novamente na resposta. O POST de comprovante usa a empresa da credencial: se `empresa_id` for omitido, usa o contexto; se for informado e divergir, responde 403 antes da persistência. O colaborador precisa pertencer à mesma empresa e estar ativo. Routers utilizados sem o middleware também negam acesso.

Migração operacional: provisionar credenciais novas no gerenciador de segredos, configurar o JSON explicitamente no processo servidor, atualizar cada consumidor para seu token específico e testar identidade/comprovante. Ausência da nova variável mantém a API fechada com 401. Não reutilizar token global comprometido nem colocar valores reais em exemplos, Git ou chat. Esta rodada não criou tokens, não alterou segredos operacionais e não fez deploy.

O worker do canal oficial permanece separado da autenticação HTTP: resolve telefone da mensagem autenticada, exige allowlist de homologação e uma única identidade ativa. A função de consulta sem empresa explícita permanece exclusivamente para esse uso interno; não há rota HTTP que autorize ausência de tenant.

## S9 — desligamento e perfil revisor

`assertEmpresaAcesso` exige sessão e restringe todos os perfis, exceto administrador da plataforma, às empresas próprias ou com vínculo ativo. `revisor` deixa de ser autorização global. A listagem de empresas aplica a mesma regra; vínculos desligados não mantêm empresas na lista.

Designações de aprovador/analista somente autorizam colaboradores ativos. A consulta usada por `auth.me` também exclui desligados. Um aprovador desligado é tratado como ausência de designação para o administrador da empresa assumir a revisão; a referência histórica não é apagada. As FKs compostas de designação continuam garantindo pertencimento à empresa. O administrador da plataforma conserva seu papel explícito de suporte.

## Evidências

- 22 testes de API/autenticação passaram: rotação, ausência/cookie/token inválido, JSON global antigo, configuração ambígua, troca de empresa no formulário e proteção adicional da identificação.
- `npm run check` e lint focal passaram na rodada final. Testes ampliados: 42 passaram, com 11 casos SQL ignorados por ausência deliberada da variável do banco nesta execução local.
- Casos SQL adicionados em `db/poc.integracao.test.ts`: mesmo telefone em empresas diferentes não vaza identidade; token A não grava pessoa B; revisor sem vínculo é barrado; desligamento revoga leitura, listagem e designação; admin da empresa assume quando designado é desligado; FK composta rejeita designado de outro tenant. Execução SQL aguarda schema de teste atualizado nesta rodada; não considerar casos escritos como casos executados.

# Renovação do painel operacional

## Memória desta frente

- Branch: `feat/interface-painel-operacional`.
- Base: release estável `v1.13.2`.
- Referência visual recebida: `/root/Painel web reembolsa.ai.zip`.
- Integridade da referência (SHA-256):
  `677aa062b07211fe7fdd6d37cb2d5790ad2acf7b9f571478b57751d27bce8533`.
- A referência é um protótipo HTML estático, com quatro telas e dados de
  demonstração. Ela não possui autenticação, banco, API, testes ou build de
  produção.

## Decisões já tomadas

1. A página inicial pública não será alterada.
2. O ZIP não será publicado nem copiado como página estática. Seus componentes
   visuais serão recriados em React e Tailwind dentro da aplicação existente.
3. As rotas, tRPC, permissões, empresa ativa, banco e dados reais existentes
   continuam sendo a fonte de verdade.
4. Os runtimes do protótipo (`support.js` e `image-slot.js`) não entram no
   produto. Eles não pertencem à arquitetura do painel atual.
5. Cada etapa precisa passar por testes, lint, TypeScript e build antes de PR.

## Telas cobertas

| Prioridade | Rota existente | Referência | Dados reais |
| --- | --- | --- | --- |
| 1 | Dashboard | Visão geral | `dashboard.resumo`, `despesas.list` |
| 2 | Revisão | Fila de revisão | `revisao.fila` |
| 3 | Revisão | Detalhe da despesa | `despesas.get`, `revisao.decidir` |
| 4 | Política | Norma de reembolso | `politica.*` |

## Próximos passos

1. Mapear os elementos reutilizáveis do template para componentes do painel.
2. Recriar o Dashboard com métricas reais, estados de carregamento e estado
   vazio.
3. Aplicar a linguagem visual à fila e ao detalhe de revisão, preservando as
   travas de permissão e as ações existentes.
4. Aplicar a linguagem visual à política, sem modificar regras de negócio.
5. Fazer revisão visual e funcional em tela desktop e mobile.
6. Executar o portão de qualidade, abrir PR, revisar, mergear e só então criar
   uma release para deploy.

## Fora de escopo desta branch

- Alterações de autenticação, banco ou regras fiscais.
- Página inicial pública.
- Integrações de e-mail e WhatsApp.
- A separação entre colaborador e usuário do painel, que está na branch
  `feat/separar-colaborador-acesso-painel` e será revisada em PR próprio.

# Política global de uso de IA

Esta regra vale para todo o projeto, em desenvolvimento, homologação e produção.

## Princípio

Modelos de IA são permitidos somente quando a funcionalidade de negócio exige interpretação de conteúdo não estruturado. Todo o restante deve usar código determinístico, banco de dados e ferramentas tradicionais do sistema.

## IA permitida

- OCR e extração estruturada de políticas e comprovantes;
- Arquiteto de Política, exclusivamente para produzir rascunho sujeito a revisão e aprovação humana;
- novas operações somente após inventário do endpoint, limite de consumo, fallback seguro e observabilidade de tokens.

Uma resposta de modelo nunca comprova aceite, não ativa uma política e não substitui decisão ou aprovação humana.

## IA proibida

É proibido consumir modelos para:

- saúde de servidor, processos, containers ou serviços;
- cron, timers, filas, retries, locks e reconciliação;
- coleta e agregação de métricas, logs e alertas;
- testes, lint, build, migrações, CI/CD, deploy e rollback;
- auditoria técnica, inventário, geração de dashboard e relatórios operacionais;
- tarefas que possam ser resolvidas com regra, consulta SQL, parser, script ou ferramenta do sistema.

## Controle obrigatório

Cada chamada permitida deve ter finalidade identificável, provedor e modelo configuráveis, teto de tokens, registro no ledger compartilhado e degradação segura. O artefato operacional descrito em [`poc/entregas/18-dashboard-ia-operacional.md`](poc/entregas/18-dashboard-ia-operacional.md) inventaria os endpoints e agrega apenas o consumo informado pelos provedores em janelas de dez minutos.

Tokens ausentes nunca são estimados ou apresentados como consumo real. Chaves, prompts, documentos e respostas não entram no artefato operacional.

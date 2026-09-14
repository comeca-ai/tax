# Campos customizados extraídos da política

Data: 2026-09-14. Base local: `b22d134`. Branch: `feat/politica-campos-customizados`.

## Fluxo implementado

1. Enviar documento: extração das regras e sugestões de campos na mesma leitura.
2. Revisar regras.
3. Campos customizados: revisar cargos, funções e particularidades; adicionar, editar, reclassificar ou remover campos; salvar o rascunho.
4. Simular e ativar explicitamente.

Cada campo contém nome, grupo, tipo (texto, número, data, seleção, sim/não), opções, obrigatoriedade, descrição e trecho de origem. O trecho extraído permanece visível para conferência; campos manuais são identificados como tais. Seleções sem opções e campos sem nome bloqueiam o salvamento. A API também valida limites e identificadores únicos.

As definições ficam em `regras.camposCustomizados`, no JSON existente da versão da política. Não há migração de banco. Políticas antigas recebem lista vazia; edição, consolidação, cópia de rascunho e leitura preservam os campos. O resumo mostra as definições salvas antes da ativação e na política vigente. A auditoria inclui a quantidade de campos.

## Extração e limites

- OpenAI e Mistral recebem a instrução de extrair os campos na chamada existente. O formato estruturado da OpenAI inclui todas as propriedades obrigatórias e `additionalProperties: false`, conforme a [documentação oficial](https://developers.openai.com/api/docs/guides/structured-outputs).
- As sugestões incluem trecho de origem, ainda sujeito à conferência humana. Não houve avaliação da fidelidade da extração com provedor real nesta entrega.
- Itens inválidos, acima do limite ou sem origem são descartados com pendência explícita para revisão. Resposta sem o novo campo também informa a ausência de extração.
- A contingência local reconhece somente listas rotuladas de cargos, funções e particularidades. Texto livre e documentos sem texto extraível exigem revisão manual.
- Cargos e funções não concedem acesso nem aprovação automática.
- Esta entrega define os campos na política. A coleta de valores por colaborador/despesa, sua validação obrigatória e seu uso nas decisões do agente ainda não estão implementados.

## Evidências locais

- Testes de contrato, extração, descarte de respostas inválidas, compatibilidade antiga, edição/remoção, consolidação e leitura do JSON.
- Testes de renderização: origem e opções visíveis, bloqueio de seleção vazia, lista vazia permitida e escape de HTML.
- Teste com resposta simulada do provedor confirma a inclusão dos campos na chamada existente e a preservação dos dados.
- Suíte do módulo de política: 17 arquivos e 244 testes aprovados. Após incluir o teste do formato enviado à OpenAI, os 13 testes dos três arquivos afetados passaram novamente.
- Verificação TypeScript, lint dos arquivos alterados e build aprovados. Build com avisos de tamanho dos bundles e base Browserslist antiga.
- Sem teste interativo em navegador ou gravação em banco real nesta entrega.

Status: implementação local. Sem publicação, deploy, migração, ativação de política ou chamada paga. Testes simulados não demonstram funcionamento em homologação nem qualidade da extração de um documento real.

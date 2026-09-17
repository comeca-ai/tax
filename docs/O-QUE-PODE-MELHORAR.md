# O que pode melhorar no reembolsa.ia — 17/09/2026

Uma frase por item, sem sigla. O detalhe de cada um (onde mexer, esforço,
origem) está na [pauta de melhorias](PAUTA-DE-MELHORIAS-2026-09-17.md).

## Produto

- Fechar o ciclo básico pelo WhatsApp: foto entra, sistema lê, decide e responde citando a regra. Hoje isso nunca rodou de ponta a ponta na homolog.
- Corrigir o recibo Pix ou de cartão sendo aprovado como se fosse nota fiscal.
- Decidir o tamanho da POC: tirar consulta à SEFAZ, modos do painel e hierarquia complexa de aprovação.
- Provar na homolog as entregas que só existem no código: parâmetros, veículo e quilometragem, equipe por planilha, métricas e pagamento, chave fiscal, nota duplicada, fila de aprovação.
- Fazer o ensaio final com a piloto e obter o aceite.
- Escolher a identidade: o README vende recuperação tributária, o produto é reembolso de despesas.

## Processo

- Ter uma `main` só, em vez de três.
- Exigir revisão de outra pessoa e CI verde antes de publicar; hoje 34 de 35 PRs não tiveram revisão.
- Publicar na homolog só código que está no GitHub e passou no CI; hoje ela roda 18 commits que só existem nesta máquina.
- Parar de criar documento novo; manter um quadro único com o que está pronto e a prova.
- Pausar esteira de agentes, revisores automáticos e pipeline até o ensaio final ter data.
- Definir uma data nova para a POC ou dizer explicitamente que não há data.

## Inteligência artificial

- Usar o heurístico e o OCR local como caminho principal do comprovante; IA paga só quando eles falham.
- Colocar crédito pequeno em um único provedor, só para ler a política, ou revisar a política à mão.
- Parar de mexer na cascata de quatro provedores até o ciclo básico funcionar.
- Contar as chamadas pagas no banco e mostrar no painel, em vez de controlar cota em documento.

## Código

- Deduplicar o utilitário de timeout, que está copiado em quatro arquivos.
- Dar variável própria ao limite de tokens do upload, que hoje divide o nome com outra função.
- Sincronizar `.env.example`, `docker-compose` e README do sidecar com o que o código faz de verdade.
- Escrever testes que verificam o tipo de documento e o provedor de política escolhido, não só que a função rodou.
- Registrar em `DECISOES.md` a cascata de OCR ampliada e o uso do OpenRouter.

## Infraestrutura e operação

- Erro interno vira log com causa e id de correlação; disco cheio e provedor sem crédito ficaram semanas escondidos atrás de "Falha interna".
- Rota de saúde mostrando se Mistral, OpenAI e o sidecar de OCR estão respondendo.
- Sidecar de OCR devolvendo "ocupado" em vez de travar quando duas requisições chegam juntas.
- Preflight recusando o diretório de uploads legado que derrubou o upload da política.
- Ler as quatro mensagens pendentes e só então religar o worker do WhatsApp.
- Remover as 19 pastas de trabalho paralelas com `git worktree remove`, não com `rm`.
- Commitar e enviar ao GitHub o trabalho que hoje só existe nesta máquina.

## Antes de tudo

- Confirmar se a piloto continua engajada depois do prazo perdido de 13/09 e o que exatamente foi prometido a ela.

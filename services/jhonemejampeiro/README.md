# JhonemeJampeiro

Assistente de evidências Reembolsa × K2. Serviço isolado, sem dependências Python externas, com interface responsiva e histórico privado por navegador em SQLite. Não altera a aplicação Reembolsa.

## Comportamento

- Base pública de 17 resumos editorialmente selecionados, vinculados à análise de 13/09/2026 e ao commit `5f3484e9ca7c4a5bf0e16141c26822e1ffa386e1`. Não é consulta em tempo real ao GitHub ou à produção.
- Respostas com status e fonte; 6 telas de demonstração, explicitamente fictícias. A captura não comprova integração backend ou aceite.
- Sem chave/ativação explícita, usa busca local e mostra **Busca nas evidências**. Não simula uma chamada de IA.
- Quando ativada, a OpenAI interpreta a pergunta e seleciona IDs do catálogo usando Responses + Structured Outputs. O servidor retorna exclusivamente o texto curado desses IDs. Não exibe prosa arbitrária do modelo e não oferece ferramentas, leitura de arquivos ou acesso ao código privado.
- Falhas, saída inválida ou limite diário do provedor acionam busca local com aviso. Não expõe diagnósticos do provedor.
- Até 60 mensagens por sessão; cookie aleatório HttpOnly/SameSite=Strict, Secure em HTTPS. Somente o hash do identificador é armazenado. Sessões expiram após 30 dias sem atividade; “Apagar conversa” revoga sessão e remove mensagens.
- Pedidos de segredos/código privado são recusados. Padrões comuns de credenciais são bloqueados antes do provedor/persistência; e-mails e números pessoais comuns são omitidos. Essa filtragem não identifica toda informação sensível possível: não inserir dados pessoais ou anexos privados. Texto livre restante fica no histórico privado, sem logs de requisição.
- POST/DELETE exigem Origin exata e cabeçalho próprio; estáticos usam lista fechada e CSP, sem listagem de diretórios. Não confiar em X-Forwarded-For vindo do cliente.

## Executar localmente

Python 3.11 ou superior; sem instalação de dependências:

```sh
python3 server.py
```

Abrir `http://127.0.0.1:4180/jampeiro/`. A pasta `private/` é local, ignorada pelo Git e nunca servida por HTTP. Não executar a aplicação com acesso ao repositório privado no ambiente publicado.

Configuração por variáveis de ambiente; `.env.example` é referência, não é carregado automaticamente. `JAMPEIRO_ORIGIN` contém apenas esquema e host/porta, sem barra final; `JAMPEIRO_BASE_PATH` é `/jampeiro`. `JAMPEIRO_AI_ENABLED` é `false` por padrão. O runtime reconhece `OPENAI_API_KEY` e o alias já autorizado `OPEN_AI_KEY`; segredos ficam fora do Git e do frontend.

## IA e limites

Modelo fixado: `gpt-4.1-mini-2025-04-14`. API `https://api.openai.com/v1/responses`, `store:false`, no máximo 300 tokens de saída. Catálogo pequeno e até 6 mensagens anteriores filtradas. Nenhum documento original é enviado.

Limite persistente de 100 tentativas de IA por dia UTC, configurable por `JAMPEIRO_DAILY_AI_LIMIT`. Cada tentativa reserva a cota antes da chamada, inclusive quando falha. Não há repetição automática nem embeddings pagos. Limites de aplicação não substituem o teto de gastos no projeto OpenAI. O teste real manual faz uma única chamada e exige ambiente protegido e limite de gasto aprovado.

Fonte técnica: [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini).

## Validação

```sh
python3 -m unittest discover -s . -p 'test_*.py' -v
python3 -m py_compile server.py
node --check public/app.js
```

19 testes backend/HTTP: persistência após recriar a aplicação, sessões isoladas, expiração/exclusão, entradas sensíveis, contexto, falta de evidência, limites concorrentes e persistentes, contrato sintético da Responses API, falhas do provedor, arquivos privados, CSRF e cookies. Não fazem chamadas pagas.

`validate_browser.mjs` exercita a interface no ambiente de captura local: desktop, 390/768 px, persistência, contexto, recusa, isolamento, exclusão, imagens e HTTP. O caminho de Playwright é específico desse ambiente; não é dependência de produção. Evidências de execução ficam em `validation/` e no registro de entrega.

## Publicação e rollback

Seguir `docs/POLITICA-DE-RELEASE-E-DEPLOY.md` do repositório: PR, CI, revisão adicional da persistência/integração, merge, release candidate, homologação e release aprovada. Não publicar uma branch ou o diretório de desenvolvimento.

Arquivos de operação em `deploy/` são propostas revisáveis, não foram aplicados automaticamente. O serviço usa usuário dedicado, release somente leitura e `/var/lib/jhonemejampeiro` para dados. A rota Caddy aponta somente para `127.0.0.1:4180`, preservando `/jampeiro`; não reiniciar o serviço Reembolsa. Credencial deve ser provisionada pela operação no ambiente protegido, a partir do secret autorizado, sem impressão/recuperação via API do GitHub. O workflow de smoke verifica a integração, mas não transfere a chave nem publica o serviço.

Antes da exposição: configuração HTTPS/origem, cota aprovada, chave no runtime, teste real, backup do SQLite com `sqlite3.Connection.backup`, pacote com SHA-256 e versão aprovada, revisão técnica. Limite por endereço é 20 mensagens/minuto e 10 por sessão/minuto; atrás do proxy o limite por endereço é global (deliberadamente conservador nesta prévia). Até 10.000 sessões e retenção limitada. A edição atual usa o servidor HTTP da biblioteca padrão atrás de Caddy para uma prévia de baixo tráfego; reavaliar servidor e armazenamento antes de carga pública ampla.

Rollback: remover a rota `/jampeiro` ou retornar o symlink `current` à release anterior e reiniciar somente `jhonemejampeiro`. Não apagar o banco. Nunca copiar `.env`, SQLite, anexos internos, repositório ou `node_modules` para a pasta pública.

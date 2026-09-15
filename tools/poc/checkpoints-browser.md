# Checkpoints: roteiro reproduzível no navegador

Executa o React real em Chromium e simula somente as respostas da API tRPC. O
servidor Vite usa configuração isolada: não importa `api/boot`, não lê os arquivos
`.env` do projeto e responde 503 a qualquer chamada de API que escape da
interceptação. Fontes e outros recursos externos são substituídos localmente.

## Execução

Pré-requisitos: dependências do projeto instaladas, Node compatível com o Vite e
Playwright com Chromium. O script usa o Playwright disponível neste ambiente em
`/root/.local/share/tax-preview/browser/node_modules/playwright/index.mjs`. Em outra
máquina, defina `POC_PLAYWRIGHT_MODULE` com o caminho absoluto do módulo instalado.

```sh
node tools/poc/checkpoints-browser.mjs --output /tmp/checkpoints-browser
```

O teste ocupa somente `127.0.0.1:3208`, falha se a porta já estiver ocupada e fecha
servidor e navegador ao terminar. Não execute enquanto outro processo instala
dependências ou altera o frontend: a impressão SHA-256 antes e depois exige que
os arquivos testados permaneçam estáveis.

## Cenários

1. Abrir `/app/dashboard#checkpoints` diretamente com respostas lentas: preservar
   a URL, não exibir um falso zero e alcançar a seção após os dados chegarem.
   O título deve ficar abaixo do cabeçalho; a posição aceita desvio de até 12px
   do destino calculado para acomodar foco e animação curta, respeitando o final
   do documento quando não houver espaço para alinhar a seção no topo.
2. Exibir uma presença sem jornada, veículo ou política no total e na tabela.
   A fixture passa pela função pura `checkpointsDoUsuario` e contém zero jornadas;
   o campo `jornadas` da resposta é o contador combinado de presenças/jornadas.
3. Usar o menu **Mais → Checkpoints acumulados** na página já carregada.
4. Trocar Alfa por Beta: esconder os dados anteriores durante o carregamento e
   mostrar somente a empresa selecionada após a resposta.
5. Simular erro em `campo.checkpoints`: exibir indisponibilidade e botão de retry,
   sem confundir falha com ausência de registros.
6. Acionar **Tentar novamente**: mostrar carregamento e recuperar os dados sem
   recarregar a página, com uma nova consulta.
7. Receber a resposta atrasada de Alfa depois de Beta: manter somente Beta na
   interface.
8. Repetir link direto e navegação em largura de 390 px, com tabela acessível e
   sem rolagem horizontal da página inteira.

## Evidências e limites

`resultado.json` registra cada cenário, horário, commit, SHA-256 da fonte e do
script, erros e resultado global. `fixture-presenca.json` registra o estado
sintético usado na agregação. Capturas PNG documentam carregamento, resultados,
erro, recuperação e celular. O processo retorna código 1 se algum cenário falhar.

Isso verifica a interface, navegação, gestão do cache e a agregação pura da
fixture. **Não comprova login, autorização real da API, persistência no banco,
isolamento do banco entre empresas, WhatsApp, Maps, homologação ou aceite da
POC.** A sessão é simulada por `auth.me`; todas as respostas de rede são
sintéticas. A segurança da API e a persistência exigem os testes próprios de
backend/SQL e evidências externas separadas.

# Dashboard operacional de IA (artefato privado)

Não há interface nem rota pública. O runtime registra somente metadados das chamadas aos provedores e atualiza, a cada dez minutos, um arquivo JSON privado com:

- endpoints externos de IA e operações internas que podem acioná-los;
- quantidade de chamadas por janela fixa de dez minutos;
- tokens de entrada, saída e total informados pelo provedor;
- quantidade de chamadas sem medição de tokens.

Prompts, documentos, respostas, chaves e cabeçalhos não são gravados. Tokens ausentes não são estimados nem tratados como zero. O endpoint OCR da Mistral pode informar páginas processadas, mas não tokens; nesse caso a chamada aparece como `chamadasSemTokens`.

## Regra de custo operacional

Saúde do servidor, verificação de processos, cron/timers, coleta de métricas, agregação e geração do artefato usam somente ferramentas tradicionais do sistema e código local determinístico. Essas atividades nunca acionam modelo de IA. IA fica restrita às operações de negócio explicitamente inventariadas no próprio artefato.

Configuração recomendada:

```dotenv
POC_AI_USAGE_LEDGER=/var/lib/reembolsa-poc/ai-usage.jsonl
POC_AI_DASHBOARD_FILE=/var/lib/reembolsa-poc/ai-dashboard.json
```

Se esses caminhos não forem definidos, ambos são derivados de `POC_CALLS_LEDGER`. Os arquivos são criados com permissão `0600`. O artefato também pode ser regenerado sem acessar nenhum provedor:

```bash
npm run poc:dashboard-ia
```

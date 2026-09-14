# Google Maps — configuração de campo

O código espera `GOOGLE_MAPS_API_KEY` no ambiente do servidor e `POC_MAPS_ENABLED=true`. O Compose passa agora essas duas variáveis ao container; antes, elas não estavam mapeadas. O `.env` do servidor não é alimentado automaticamente pelos secrets do GitHub. Nenhum valor de credencial foi lido ou exibido nesta revisão.

O workflow manual `verificar-secrets-maps.yml` verifica somente a presença de `secrets.GOOGLE_MAPS_API_KEY` e o valor booleano de `vars.POC_MAPS_ENABLED`, no ambiente `homologacao`, sem chamar o provedor. Não foi executado nesta revisão.

O cálculo (`campo.calcular` → `estimarJornada`) consulta Google Routes API, preserva a ordem dos check-ins e retorna distância apenas depois do check-out. Exige entre 2 e 27 pontos. Capturar check-in não consulta Google. Falha, ausência de chave, serviço desabilitado ou resposta incompleta mantêm `aguardando_calculo`; distância não é inventada.

Gate real restante: provisionar a mesma credencial no runtime, habilitar a flag, confirmar a disponibilidade da Routes API para a credencial e executar uma jornada autorizada com check-in, checkpoint e check-out. Registrar a distância retornada e o memorial por UF. Não foram executados deploy, chamada à API ou inspeção dos valores de secrets nesta revisão; portanto, presença e funcionamento no servidor ainda não estão comprovados.

Validação às 17:59 UTC: 19 testes passaram (`tools/poc/maps-config.test.ts` e `api/modules/reembolso/campo/dominio.test.ts`), incluindo script de presença em VM com credencial sintética, ausência de exposição do valor e mapeamento do Compose. A suíte legada `tools/github/workflows-security.check.mjs` passou nos checks estáticos de SHA/permissões e apresentou quatro falhas nos testes de subprocesso Node via stdin (artefatos não criados/status inesperado); essas falhas permanecem registradas e não foram contadas como sucesso.

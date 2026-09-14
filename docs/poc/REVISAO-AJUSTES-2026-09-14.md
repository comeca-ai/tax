# Revisão dos ajustes da POC — 14/09/2026

Escopo: candidato de homologação autorizado pelo solicitante. Não é aceite integral da POC nem autorização para promover a produção.

## Comportamento entregue no código

- **Confirmação WhatsApp:** texto único `Comprovante Recebido!`, fila persistente e envio separado da leitura da imagem. Varredura a cada segundo quando o worker está habilitado. A mesma mensagem não gera outra confirmação; envio é cancelado se transcorrerem 24 horas desde a mensagem recebida. Resultado incerto do provedor não é reenviado automaticamente.
- **Identificação do remetente:** compatibilidade restrita à presença/ausência do nono dígito de celular brasileiro no canal autenticado, com vínculo ativo único e allowlist. A API pública continua exigindo telefone E.164 exato.
- **Colaborador / CC:** os uploads web recuperam o vínculo ativo único do usuário na empresa. Campo vazio é identificado na tela. O responsável pela revisão pode selecionar explicitamente o colaborador, com justificativa, registro dos valores anteriores e proteção contra alterações concorrentes. Não se infere que um administrador enviou a despesa em nome de outro colaborador.
- **Verificação fiscal opcional:** opção por empresa, desativada por padrão, após OCR e antes da decisão, para painel e WhatsApp. Reserva e orçamento persistidos antes da rede. A cobertura atual do adaptador é NF-e modelo 55; NFC-e modelo 65 recebe estado não suportado, sem consulta paga. Resultado fiscal não substitui a política de reembolso.
- **Check-in/check-out e Maps:** os pontos e seus IDs permanecem no banco. Cálculo automático após check-out é opcional por empresa. Intervalo entre tentativas é configurável em minutos (1 a 10.080; padrão 30). Reserva, ID da consulta, horários e resultado ficam persistidos; uma jornada já calculada não é consultada novamente.

## Revisão e limites

Revisão cruzada dos módulos de fiscal/identificação e de Maps/telefone por dois agentes. Os testes SQL usam banco descartável e respostas sintéticas para APIs fiscais e de mapas. A leitura de foto e a aceitação de respostas pela 360dialog foram observadas em teste real de homologação; aceitação pela API e entrega ao celular são evidências distintas.

A fila automática é limitada pelo saldo autorizado compartilhado de WhatsApp/OpenAI, reservado em arquivo privado antes da rede. O saldo permanece consumido após erro, reinício ou deploy. Na transição deste candidato, 18 das 20 chamadas já haviam sido reservadas; uma ampliação exige autorização do solicitante. Habilitar uma opção no painel não compra créditos nem comprova credenciais/serviço externo disponíveis. A consulta de distância é uma estimativa entre os pontos enviados, sem rastreamento contínuo.

Os totais finais de testes, hash do bundle, versão publicada e resultado do navegador ficam no manifesto da instalação e no relatório de liberação. Esta revisão não substitui CI remoto, revisão humana ou ensaio integral E1–E12.

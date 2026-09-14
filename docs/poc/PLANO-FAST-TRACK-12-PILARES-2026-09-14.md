# Plano fast track — POC Reembolsa — 12 pilares

Data de corte: 14/09/2026. Branch: `feat/poc-integrada-20260914`. Homologação: `https://homolog.oreembolsobot.app`.

## Objetivo

Colocar o caminho crítico da POC de pé em homologação durante a madrugada, com evidência reproduzível por etapa. O objetivo é demonstrar o fluxo integrado e separar claramente o que está implementado, o que foi testado e o que ainda depende de aceite humano ou fornecedor.

Produção permanece fora do plano. Nenhuma consulta paga ou promoção para produção ocorre sem autorização própria.

## Base verificada

- `npm test`: 96 arquivos aprovados, 826 testes aprovados e 39 ignorados.
- Typecheck, lint e build aprovados no commit da branch.
- Check-in/check-out por duas localizações publicado em homologação.
- Saudação do painel ajustada por horário local do navegador.
- Arquiteto de Política disponível na revisão do OCR como rascunho editável com aprovação manual.
- Backup e isolamento de homologação verificados; produção inalterada.

## Matriz de execução

| Pilar | Base existente | Ação fast track | Evidência de saída | Estado de aceite |
|---|---|---|---|---|
| E1 Modos | sombra, assistido e autônomo configuráveis | executar o mesmo caso nos três modos e reverter | IDs das despesas, modo, decisão e reversão | pendente |
| E2 Aprovação | fila, responsável, delegado e auditoria parcial | aprovar, delegar, negar e revisar com dois perfis | histórico com ator, motivo e versão | pendente |
| E3 Configuração | política, tarifas, fiscal, Maps e campo | alterar parâmetro e confirmar consumo no decisor | entrada, decisão e regra aplicada | pendente |
| E4 Veículo | cadastro e validações | consumo declarado, divergência >15% e vínculo | ficha, decisão e confiança | pendente |
| E5 Equipe | CSV, prévia, convites e domínio | importar, corrigir linha, aceitar convite e testar superior | relatório do lote e aceite | pendente |
| E6 Métricas/pagamento | painéis e registro manual | aprovar despesa, registrar pagamento e conferir período | autoria, referência, estado paga | pendente |
| E7 Chave fiscal | persistência e extração XML/texto | documento real elegível do piloto | arquivo, chave, campos e hash | pendente |
| E8 Consulta fiscal | orçamento, estados e adaptador NF-e 55 | consulta real autorizada de documento suportado | provider, protocolo, resposta e decisão | pendente |
| E9 Antifraude | checksum e integridade parcial | repetir nota por canais e alterar imagem | classificação, motivo e falso positivo observado | pendente |
| E10 WhatsApp | 360dialog, foto, confirmação e decisões | foto → OCR → decisão → resposta positiva/negativa | IDs de entrada/saída e regra | pendente |
| E11 Campo | presença, jornada, tarifa e memorial | duas localizações, veículo, rota e trecho comercial | presença, jornada, metros e memorial | pendente |
| E12 Integral | roteiro e testes automatizados | executar E1–E11 com empresa real e registrar bloqueios | dossiê assinado por etapa | não iniciado |

## Ordem da madrugada

1. **Smoke operacional:** autenticação, empresa ativa, saudação, política ativa e seleção de colaboradora.
2. **Campo:** check-in por localização, check-out por localização, ficha da colaboradora, vínculo posterior ao veículo e jornada.
3. **Política:** OCR, Arquiteto de Política, revisão da regra, nova versão e ativação.
4. **Despesa:** comprovante, extração, veredito, revisão humana, aprovação/negação e histórico.
5. **WhatsApp:** caso positivo, caso negativo, reentrega idempotente e rastreio de resposta.
6. **Fiscal e antifraude:** somente documentos e provedores autorizados; registrar `incerto` quando a evidência não for suficiente.
7. **E12:** repetir o roteiro com dados elegíveis, consolidar evidências e classificar cada pilar.

## Critério de encerramento

Um pilar só muda para **demonstrado** quando houver código publicado, teste correspondente, evidência no ambiente correto e aceite humano quando a etapa exigir decisão de negócio. CI verde, HTTP 200, presença de segredo ou teste simulado isolado não encerram um pilar.

Ao final, o relatório deve separar: demonstrado em homologação; implementado sem evidência real; bloqueado por fornecedor/dado/autorização; e trabalho de código restante.

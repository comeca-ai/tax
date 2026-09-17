# Painel integrado da POC

Referência visual: ZIP `Painel web reembolsa.ai (1).zip`, fornecido pelo usuário.
São reutilizados os tokens e as fontes latinas IBM Plex do pacote. O runtime
`dc`, as constantes de demonstração e os temporizadores do protótipo não são
distribuídos na aplicação.

As telas permanecem conectadas aos contratos existentes:

| Experiência | Integração |
|---|---|
| Visão geral | Resumo e despesas da empresa selecionada |
| Fila de revisão | `revisao.fila`, autorização retornada pelo servidor |
| Detalhe | Painel de revisão e drawer de despesas existentes; nenhum ID de exemplo |
| Norma | Política ativa e histórico consultados por empresa |
| Enviar documento | `/app/politica/nova`, upload real e extração no servidor |
| Revisar regras | Revisão local; salva regras e campos extraídos no rascunho |
| Simular e ativar | `politica.testar` com ID do rascunho, depois ativação explícita |

O seletor de empresa sincroniza todas as instâncias e abas. A troca remonta o
conteúdo da página, descartando formulário/detalhe da empresa anterior. Isso
complementa as verificações de tenant do servidor, sem substituí-las.

Falhas nas consultas de empresa, resumo, fila ou política são estados de erro,
não indicadores zerados ou filas vazias. Upload e simulação só indicam conclusão
depois da resposta real. Decisões requerem motivo e, quando aplicável, motivo de
delegação; controles ficam bloqueados durante envio.

Limites: nenhuma integração PIX/SEFAZ foi acrescentada. Testes de renderização
sem DOM verificam estados, mas não comprovam acessibilidade ou fidelidade em
navegador. Homologação visual autenticada e ponta a ponta continuam necessárias.

## Campo e conciliação

A rota `/app/campo` usa a guarda de equipe e confirma administração da empresa
selecionada antes de consultar dados. A seleção de colaborador é explícita e
restrita à empresa ativa. O painel consulta jornadas, pontos, documentos,
conciliações, métricas e histórico; aciona cálculo posterior, importação de nota,
conferência com motivo, conciliação e registro de pagamento já realizado.

Os parâmetros exigem uma política ativa e preenchimento explícito. Placas são
validadas no servidor contra veículos cadastrados; a interface não cria veículos
nem presume consumo. Na importação de documento, somente colaborador, nota e
placa entram no pedido: campos fiscais e hash continuam exclusivamente no servidor.
PDF/imagem com extração incompleta não pode ser marcado regular pela interface.

Pagamento é registro manual sobre despesa aprovada, sem chamada bancária. As
despesas disponíveis para esse registro pertencem à empresa ativa. A tela não
declara entrega de lembretes, autenticidade SEFAZ, direito a crédito tributário
ou distância efetivamente percorrida a partir de agendamento/extração/estimativa.

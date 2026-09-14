# Consulta inicial NF-e 55 com NFE.io

Em 13/09/2026, o usuário escolheu NFE.io para a consulta inicial, atualizando D-025. **Integração preparada com testes sintéticos; nenhuma chamada externa executada por este agente.** Focus NFe não foi implementado. Não foram criadas contas nem credenciais. O secret GitHub informado/verificado pelo operador é `API_NFE_IO`; seu valor não foi lido nem registrado nesta implementação.

## Contrato e limites

O adapter exclusivo do servidor usa uma única chamada `GET https://nfe.api.nfe.io/v2/productinvoices/serpro/{accessKey}`, enviando a Chave de Dados diretamente no header `Authorization`, sem `Bearer`. Host e path são fixos; redirects e retries são proibidos. Há timeout de 15 segundos e limite de resposta de 2 MB. Referências oficiais consultadas: [portal](https://nfe.io/docs/) e [Consulta Irrestrita](https://nfe.io/docs/documentacao/consultas/notas-fiscais/consulta-irrestrita/).

Aceita exclusivamente chave com 44 dígitos, DV válido e **modelo 55**. Não promete consulta NFC-e modelo 65. O JSON retornado deve referir-se à mesma chave/modelo. `currentStatus=Canceled` prevalece mesmo quando o protocolo original continua 100. Para retornar `autorizada`, exige também status atual Authorized, protocolo 100, ambiente Production e destinatário correspondente à empresa autorizada. Homologation, situação desconhecida, cancelamento e destinatário divergente são resultados distintos; nenhum deles aprova reembolso.

HTTP 401/403/404/429/5xx, resposta malformada e timeout viram resultados tipados e sanitizados. Não retornamos JSON/XML bruto, nomes, endereço, CNPJ, chave fiscal ou credencial. Esta etapa fornece diagnóstico mínimo; não captura XML oficial, não manifesta operação, não emite nota, não altera o documento de campo, não aprova despesa nem realiza pagamento.

## Rota e vínculo no servidor

A mutation autenticada `nfeio.consultar` recebe exclusivamente:

```json
{
  "empresaId": 42,
  "notaFiscalId": 8,
  "solicitacaoId": "865454c3-aa0e-4eca-8837-d42865d2bedd",
  "confirmarConsulta": true
}
```

Administração da empresa é conferida **antes** de ler a nota, configuração, orçamento ou consultar rede. A rota não aceita chave fiscal arbitrária nem URL. O schema `notas_fiscais` não possui chave de acesso: buscamos a chave já persistida em `poc_campo.estado.documentos`, vinculada à nota por inbox/despesa/colaborador e conferida contra `poc_documentos` e checksum do arquivo. Se o vínculo ou a chave ainda não existir, a consulta é bloqueada com pré-condição explícita; não se inventa nem se digita outra chave nessa rota.

Uma NF-e de teste precisa, portanto, estar previamente associada ao arquivo e empresa corretos. O exemplo de chave dos fornecedores não autoriza consultá-la pelo produto nem serve como fixture real de cliente.

## Configuração, autorização de custo e orçamento

- `API_NFE_IO`: Chave de Dados, injetada somente no ambiente protegido do backend. Não usar `VITE_*`, frontend, logs ou argumento de shell.
- `NFE_IO_ENABLED`: desabilitado por padrão; somente `true` habilita a rota após as demais validações.
- `NFE_IO_BUDGET_ID`: identificador de um orçamento **previamente provisionado pelo operador** em `nfe_io_orcamentos`. Definir a variável não cria saldo.

A migração aditiva `0017_nfe_io_consultas.sql` cria duas tabelas sem inserir orçamento. O limite padrão é zero. A rota nunca cria, repõe ou aumenta verba; exige linha provisionada com limite positivo, no máximo 20 e saldo disponível. **Esse teto técnico não concede 20 consultas adicionais à NFE.io**: o operador deve alocar somente unidades ainda disponíveis no limite global autorizado pelo usuário, compartilhado com os testes de outros provedores. Não foi feita alocação nesta entrega.

Antes da rede, uma transação bloqueia a linha de orçamento, registra solicitação e consome uma unidade. Timeout, falha de transporte ou erro posterior à resposta não devolvem a unidade automaticamente. O registro guarda apenas IDs técnicos, hash da chave, estado e resultado mínimo. Não há retry do provedor.

Repetir o mesmo `solicitacaoId` com o mesmo usuário/empresa/nota/orçamento retorna o resultado persistido ou informa necessidade de conciliação, sem nova chamada. Reutilizar esse ID para outro vínculo é recusado. Não gerar novo UUID para contornar um timeout: primeiro conferir o registro operacional e o orçamento global. Crash entre reserva e resultado permanece identificável e não dispara nova chamada automática.

## Verificação e ativação posterior

Os testes do adapter e da rota usam respostas sintéticas e provam formato/DV/modelo, destino fixo, autenticação raw, limites, cancelamento, divergência, autorização antes da rede, orçamento ausente/esgotado e idempotência. O teste da migração verifica DDL aditivo e ausência de alocação automática. Eles não certificam permissões reais da Chave de Dados, disponibilidade da NF-e ou cobrança comercial.

Após revisão/merge e migração aprovada, o root deve verificar a instalação do secret no servidor, registrar a alocação explícita no controle global, provisionar orçamento e habilitar a rota apenas durante a prova autorizada. Somente o root coordena e contabiliza chamadas reais. Ao encerrar, desabilitar `NFE_IO_ENABLED`; preservar o histórico para prestação de contas. Não há workflow automático com esse secret nem execução por cron.

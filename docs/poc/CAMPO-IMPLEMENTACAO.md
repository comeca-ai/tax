# Núcleo de campo: implementação e limites verificáveis

Código novo em `api/modules/reembolso/campo`, router `campoRouter` em
`api/routers/campo.ts`, schema adicional `db/pocSchema.ts`, migração aditiva 0016.
O integrador deve registrar o router e a migração no journal; estes arquivos
compartilhados ficam sob responsabilidade da integração principal.

## Interfaces

- `registrarEventoCampo({empresaId,colaboradorId}, {jornadaId,veiculo,ponto})`:
  identidade deve ser resolvida no servidor. O serviço revalida vínculo ativo,
  política e versão, e bloqueia a linha da pessoa antes de ler/gravar o agregado.
- `interpretarMensagemCampo(identity, {id,type,text?,location?,timestamp})`:
  retorna `{textoResposta}` ou null. Comandos `check-in PLACA`, `checkpoint`,
  `check-out` aguardam localização por 15 minutos. O worker persiste/envia a
  resposta pela outbox. O horário pode ser UNIX segundos ou ISO.
- Router autenticado: `consultar`, `registrarEvento`, `calcular`,
  `registrarDocumento`, `revisarDocumento`, `conciliar`, `registrarPagamento`,
  `configuracao`, `configurar`. Operações do backoffice são restritas ao admin
  da empresa/plataforma pelo RBAC existente; eventos do canal usam identidade
  resolvida sem login humano.
- `aplicarModo(veredito, modo?, confirmacaoHumana?)` conserva o veredito do
  decisor existente e informa efeitos permitidos; padrão sombra. O chamador
  ainda deve aplicar o resultado autorizado e escrever sua outbox atomicamente.
- `importarDocumentoCampo(identity, {notaFiscalId,veiculo}, extrator?, usuarioId?)`
  resolve nota privada pela despesa/inbox da mesma pessoa e empresa, calcula
  SHA256 do binário no servidor e extrai os campos. `registrarDocumento` aceita
  somente colaboradorId/notaFiscalId/veiculo; hash e campos fiscais do cliente
  não são aceitos. O extrator padrão é XML local sem rede. Um extrator OCR
  adicional é injetável pelo servidor após autorização de uso do provedor.
- `executarCicloLembretesCampo(enfileirarRespostaWhatsapp, cursor?)` percorre
  lotes de 100 pessoas. Root deve executar os lotes e guardar o cursor. A
  intenção de envio e o contador de etapas são gravados na mesma transação.
  `validarLembreteCampo(identity, referencia)` deve ser conectado ao callback
  do worker imediatamente antes do envio para cancelar regularizações.

## Persistência e invariantes

`poc_campo` contém um agregado por colaborador, com eventos originais,
conversa, auditoria e versões de conciliação. Transação/lock em colaborador
serializa também a primeira criação. FKs compostas bloqueiam associação entre
empresas. Índices únicos de documento por empresa/chave e empresa/hash
impedem repetição inclusive por outro colaborador. O agregado tem limite
explícito de 4 MB: atingir esse limite exige arquivamento; não descarta histórico.

Configuração exige política existente ativa e mesma versão, parâmetros
explícitos e histórico com autoria. Captura guarda snapshot do consumo do
veículo cadastrado, nunca o consumo enviado pelo cliente. Eventos tardios ou
fora de sequência são rejeitados para tratamento operacional, não reordenados.
Pagamento é um registro manual autorizado sobre despesa aprovada; não há PIX.

Maps só executa em comando posterior, com `POC_MAPS_ENABLED=true` e
`GOOGLE_MAPS_API_KEY`. Falha/ausência deixa distância nula. Máximo 25 pontos
intermediários; jornadas maiores ficam pendentes. Não otimiza ordem, não guarda
polyline/resposta bruta. A habilitação exige confirmar orçamento, termos e
retenção aplicáveis. Endpoint/headers conferidos na
[documentação oficial de rotas](https://developers.google.com/maps/documentation/routes/compute_route_directions)
e [pontos intermediários](https://developers.google.com/maps/documentation/routes/intermed_waypoints).

## Limitações que impedem declarar POC completa

- Testes de serviço usam persistência simulada; executar migração e testes de
  concorrência/rollback/isolation em MySQL/MariaDB real antes do aceite.
- Não há UI neste pacote; root integra a interface existente.
- Documentos agora têm vínculo ao arquivo privado, hash calculado no servidor
  e extração de XML local. Imagem/PDF sem extrator autorizado permanecem com
  campos nulos e revisão bloqueada para regularização. O contrato OCR legado
  não fornece chave/CNPJ destinatário: um provider que não os extrai não fecha
  esta evidência. O parser XML não verifica assinatura/situação fiscal.
- Estado `conciliado` significa cobertura documental conferida, não igualdade
  entre litros comprados/consumidos nem aprovação de crédito tributário.
- Lembretes respeitam prazo, intervalo/limite configurados e janela de 23h da
  última mensagem original do canal. Fora da janela permanecem sem envio:
  não há template aprovado configurado neste pacote. Root conecta scanner e
  callback pré-envio à outbox. Uma regularização posterior ao início da chamada
  externa pode concorrer com o envio; não se promete atomicidade com o provedor.
- Regras de percurso comercial e modos são registrados, mas o vínculo entre
  cada trecho e política/hierarquia e a aplicação do veredito ainda exigem
  integração. Distância de rota não é automaticamente km comercial elegível.
- Retenção de localização está parametrizada; limpeza/anonimização operacional
  e aceite da ciência de coleta precisam ser homologados antes de dados reais.
- A configuração do canal real, APIs externas, Focus/NFE.io, amostra OCR/E9,
  aceite de produto e release permanecem gates separados.

Reversão de aplicação preserva estas tabelas aditivas; não executar DROP para
reverter código. Backup/restauração precisam ser ensaiados antes da promoção.

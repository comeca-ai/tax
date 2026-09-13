# POC-04 — Ativar equipe pelo WhatsApp e classificar interno/externo

**Marco:** POC 1 — Base segura e cadastros  
**Prioridade:** P0  
**Responsabilidade:** Produto e interface; responsável nominal a definir  
**Referências:** E5, E10  
**Depende de:** POC-02, POC-03

## Resultado esperado

O administrador prepara a equipe; cada pessoa entende como ativar o canal e enviar evidências.

## Ponto de partida verificado

O banco já possui equipe interna/externa (padrão externa), papel e nível, mas o formulário/API atual não permite configurá-los. Cadastro individual e convites existem; importação em lote e vínculos hierárquicos são pendentes.

## Critérios de aceite

- [ ] Planilha é pré-validada e resumida sem gravar ou enviar convites; telefone/matrícula inválidos ou duplicados são apontados por linha.
- [ ] Confirmação explícita do administrador autoriza gravação e convites; superiores e vínculos ficam na empresa correta.
- [ ] Classificar atuação interno/externo sem transformar a classificação em autorização automática: os direitos vêm da política, inclusive deslocamentos eventuais de internos.
- [ ] Onboarding identifica número, convite, pessoa e empresa antes de aceitar operações; testes do envio real dependem de POC-06.
- [ ] Entregar texto de ativação, orientação para nota de combustível no CNPJ do empregador e roteiro/animação curta de check-in, visitas e retorno.
- [ ] Solicitar veículo e informações de campo apenas para quem necessita desse fluxo; critérios de acesso e retenção de localização são definidos antes da coleta real.

## Decisões a fechar durante esta entrega

- Confirmar vocabulário de vínculo CLT/MEI/PJ e superior direto exigido por E5; nomear responsável por aprovar textos e material de orientação.

## Evidência de conclusão

Vincular PRs, testes relevantes e teste manual em homologação. Alteração de dados,
autorização ou integração exige prova em banco/API e plano de reversão. Código
mesclado, homologação e habilitação produtiva são estados distintos.

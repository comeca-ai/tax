# POC-17 — Extrair da política cargos, responsabilidades e condições de aprovação

**Marco:** POC 1 — Base segura e cadastros  
**Prioridade:** P0  
**Responsabilidade:** Produto e autorização; responsável nominal a definir  
**Referências:** E2, E3, E5, revisão solicitada pelo usuário  
**Depende de:** POC-02, POC-03, POC-04

## Resultado esperado

Ler a política como fonte normativa, vincular cargos/responsabilidades às pessoas reais e permitir aprovação automática do trajeto nas condições autorizadas.

## Ponto de partida verificado

O modelo seleciona um analista e um aprovador por empresa. Cargo, nível e papel não definem uma cadeia executável; superior direto está só em comentário antigo. Ver REVISAO-HIERARQUIA.md. A diretriz D-024 determina que a política fornece as regras de hierarquia e automação; o cadastro resolve os ocupantes dos papéis.

[Diagnóstico de hierarquia](../REVISAO-HIERARQUIA.md).

## Critérios de aceite

- [ ] Extrair da política cargos/perfis, responsabilidades, despesas elegíveis, condições de trajeto, limites, etapas e autorização para automação; cada regra cita trecho e versão.
- [ ] Apresentar interpretação estruturada ao responsável da empresa para validação; regra ambígua, incompleta ou contraditória impede ativação daquela automação.
- [ ] Vincular perfis normativos às pessoas reais do cadastro; não inventar organograma nem conceder acesso porque a IA inferiu um cargo.
- [ ] Testar trajeto consolidado + perfil elegível + regra explícita + evidências suficientes: o decisor aprova automaticamente quando o modo vigente autoriza aplicar o resultado; sombra e assistido mantêm seus efeitos próprios.
- [ ] Validar exemplos reais da empresa: despesa do vendedor, do próprio gestor e de pessoa interna em atividade externa; confirmar condições por equipe, categoria e valor sem inventar tetos.
- [ ] Distinguir acesso ao sistema, cargo/área, atuação interna/externa, vínculo contratual e papel na aprovação; nenhum campo implica permissão por convenção textual.
- [ ] Modelar superior/equipe/centro de custo e responsáveis aplicáveis com vínculos da mesma empresa, sem ciclos, autoria e vigência.
- [ ] Ler da política se conferência/aprovação humana são necessárias naquele caso; fluxo elegível à automação não recebe etapa humana obrigatória por padrão.
- [ ] Definir alçadas e ordem de encaminhamento pela política validada; cargo ou nivelAprovacao isolado não autoriza despesa.
- [ ] Estabelecer substituição/delegação autorizada com escopo, início/fim e motivo, revogação e tratamento de desligamento; justificativa registra um ato, não concede poder.
- [ ] Impedir que uma pessoa decida sobre a própria solicitação fora do fluxo autorizado e definir fallback para conflitos; aprovação automática do motor, baseada na política, é um caso distinto.
- [ ] Associar despesa ao solicitante por ID empresarial estável, preservando históricos; nome livre não serve de base para roteamento/autoaprovação.
- [ ] Suspensão/desligamento revoga poderes operacionais de decisão imediatamente sem apagar trilha; testes de sessão ativa e designação antiga devem comprovar a regra.
- [ ] Testar API e banco com duas equipes, gestor substituto, teto limítrofe, conflito de interesse e tentativa entre empresas; mostrar no painel etapa/responsável/motivo.
- [ ] Registrar o fluxo aprovado por produto antes de alterar runtime. O desenho proposto é hipótese de modelagem até esse aceite.

## Decisões a fechar durante esta entrega

- Validar a política real e exemplos da empresa: quais cargos podem pedir, que evidências/condições bastam à aprovação automática e quem assume os casos de revisão.
- Confirmar escopo/vigência de substituição e autoridade; não criar alçadas externas ou contraditórias à política.

## Evidência de conclusão

Vincular PRs, testes relevantes e teste manual em homologação. Alteração de dados,
autorização ou integração exige prova em banco/API e plano de reversão. Código
mesclado, homologação e habilitação produtiva são estados distintos.

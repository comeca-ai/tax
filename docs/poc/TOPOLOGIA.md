# Topologia da POC — estado atual e desenho de conclusão

Referência: `main` em `c5a6bdf` (PR #17 integrado), verificada em 13/09/2026.
Verde: base implementada. Laranja: integração parcial. Cinza tracejado:
planejado. Implementação não significa homologação ou habilitação produtiva.

![Topologia da POC](topologia-poc.svg)

## Módulos e conexões

```mermaid
flowchart TB
    pessoa["Colaborador · interno ou campo"]
    admin["B2B · empresa e responsáveis definidos na política"]

    pessoa --> dialog["360dialog · canal único escolhido<br/>Entrada de eventos existente; fluxo produtivo parcial"]
    admin --> web["Painel web · existente"]

    subgraph sistema["Reembolsa · mesmo repositório e núcleo modular"]
        api["API e identidade<br/>Pessoa, empresa, permissões"]
        documentos["Comprovantes e OCR<br/>Base existente; integração do canal pendente"]
        reembolso["Reembolso<br/>Política versionada e decisor existentes"]
        perfis["Interpretar cargos e responsabilidades da política<br/>Validar e vincular ao cadastro · POC-17"]
        automatico["Aprovação automática do trajeto<br/>Regra explícita + evidências + modo autorizado"]
        revisao["Revisão humana<br/>Fila existente; modos/retorno a concluir"]
        fiscal["Motor fiscal de combustível<br/>Existente; nota/validação/conciliação a integrar"]
        fila["Inbox/outbox<br/>Tabelas existentes; worker durável a conectar"]
        jornada["Jornadas<br/>Check-in → visitas → check-out<br/>Planejado; tabela de posições já existe"]
        consolidacao["Consolidação posterior<br/>Trechos ordenados e km comerciais<br/>Planejado"]
        conciliacao["Conciliação por período<br/>Jornadas + veículo + notas<br/>Planejado"]
        cobranca["Solicitar notas faltantes<br/>CNPJ do empregador · parar ao regularizar<br/>Planejado"]
    end

    dialog --> api
    web --> api
    api --> documentos
    documentos --> reembolso
    reembolso -->|Pendência ou etapa exigida| revisao
    perfis -.-> reembolso
    consolidacao -.-> reembolso
    reembolso -.-> automatico
    automatico -.-> fila
    documentos --> fiscal
    api -. "recepção durável a integrar" .-> fila
    fila -. "comandos/localização" .-> jornada
    jornada -.-> consolidacao
    consolidacao -.-> maps["Google Maps<br/>Integração futura"]
    maps -. "estimativa dos trechos" .-> consolidacao
    consolidacao -.-> conciliacao
    fiscal -.-> conciliacao
    fiscal -.-> consulta["Integridade documental · planejada<br/>Consulta SEFAZ: escopo a decidir"]
    conciliacao -. "pendência documental" .-> cobranca
    cobranca -. "intenção de envio" .-> fila
    revisao -. "decisão autorizada" .-> fila
    fila -. "saída a integrar" .-> dialog

    db[("MySQL / MariaDB<br/>Fonte persistente existente<br/>Novas estruturas por migração")]
    api --> db
    documentos --> db
    reembolso --> db
    fiscal --> db
    fila --> db
    jornada -.-> db
    conciliacao -.-> db

    classDef existente fill:#e8f7ed,stroke:#258653,color:#153c28
    classDef parcial fill:#fff2db,stroke:#ba7a17,color:#633e08
    classDef futuro fill:#f1f5f9,stroke:#64748b,stroke-dasharray:5 4,color:#26384c
    class web,api,reembolso,db existente
    class dialog,documentos,revisao,fiscal,fila parcial
    class jornada,consolidacao,conciliacao,cobranca,maps,consulta,perfis,automatico futuro
```

## Como interpretar

- As jornadas [B2B/B2C](GAPS-JORNADAS.md) se encontram no mesmo caso auditável:
  empresa no backoffice, colaborador somente pelo WhatsApp e operação técnica
  com correlação/reprocessamento. Ter cada módulo isolado não fecha a POC.
- Política é fonte de cargos, responsabilidades e autorização de automação
  (D-024). A leitura precisa ser validada e vinculada às pessoas reais. Um
  trajeto elegível pode ser aprovado automaticamente; a [revisão de hierarquia](REVISAO-HIERARQUIA.md)
  mostra por que esse caminho ainda exige trabalho no código atual.
- O deploy atualmente descrito em [DEPLOY](../DEPLOY.md) é Node sob systemd.
  O desenho representa módulos lógicos; não afirma que existam microserviços,
  contêineres de worker ou Google Maps já implantados.
- As tabelas de inbox/outbox existem, porém o webhook 360dialog ainda tem
  persistência best-effort. POC-06 conecta o processamento durável antes de
  habilitar o piloto.
- Reembolso e fiscal consomem evidências com regras próprias. A decisão de um
  motor não autoriza o resultado do outro.
- A posição enviada é um evento; o trajeto entre posições é uma estimativa
  posterior. Eventos originais são preservados. Precisão e horário de captura
  são armazenados somente se fornecidos.
- Conciliação considera várias jornadas e abastecimentos por período. Não
  exige uma nota a cada checkout, nem trata litros abastecidos como consumo
  observado.
- A cobrança de notas usa o CNPJ do empregador identificado no servidor.
  Documentação pendente, reembolso e pagamento registrado têm estados separados.

## Ordem de construção

[POC-01–05 e POC-17](README.md): base, política, modos, cadastro e responsabilidades →
[POC-06–08](README.md): canal e decisão →
[POC-09–10](README.md): campo e Maps →
[POC-11–14](README.md): fiscal, conciliação e cobrança →
[POC-15–16](README.md): medição e aceite completo.

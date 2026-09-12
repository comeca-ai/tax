# 08 · `comeca-ai/fiscal` — Passaporte Fiscal + Rede de Créditos

> Levantamento manual de 2026-09-12 (README principal + READMEs dos apps).
> Deep research complementar em andamento (task d93075a3).

## Veredicto

**NÃO é um app de reembolso corporativo e NÃO deve ser mergeado no `tax`.**
É um produto separado, com domínio, stack e modelo de negócio próprios.

## O que é

Monorepo do "Projeto v2": **um repo, dois deploys, dois CNPJs.**

| App | Papel | Status |
| --- | --- | --- |
| `apps/p1-passaporte` | **P1 · Plataforma Fiscal** — calculadora de deságio + Passaporte assinado (Ed25519) com ruleset determinístico (`BR-SP-CAT42@v2026.09`) e rating A/B/C | No ar (Cloudflare Workers) |
| `apps/p2-rede` | **P2 · Rede de Créditos** — rede privada que só consome passaportes do P1 | Placeholder (liga com ≥3 passaportes A/B + Gate 0 jurídico) |

**Tese**: o crédito de ICMS vira um **ativo padronizado** — o *Passaporte
Fiscal*, um dossiê assinado, reproduzível e com rating — na janela
regulatória da EC 132 / LC 214.

## Stack e garantias

- Cloudflare-first: Workers + D1 + R2 + Queues (sem Durable Objects no MVP).
- Motor de regras = função pura; Passaporte assinado é o único contrato.
- 4 provas automatizadas (`npm test`): determinismo, ruleset versionado com
  hash, pricing (rating melhor ⇒ deságio menor), assinatura Ed25519
  (adulteração de 1 centavo invalida).
- Endpoints: `/api/health`, `/api/ruleset`, `/api/pubkey`, `/api/desagio`,
  `POST /api/passaporte`, `POST /api/verify`.

## Documentação do repo

- `docs/Especificacao-Final-v1.0.{pdf,docx}` — fonte única de decisões
- `docs/Plano-Fase-0.pdf` — duas trilhas (descoberta P1 + Gate 0 P2)
- `docs/Arquitetura-Passaporte-Rede.pdf` — diagrama P1 → Passaporte → P2
- `docs/Sketch-Telas-P1-P2.pdf` — wireframes

## Relação com o `tax`

- **Sobreposição de código/domínio**: nenhuma identificada. O `tax` faz
  gestão de reembolso corporativo (OCR, WhatsApp, políticas, convites);
  o `fiscal` faz monetização de crédito de ICMS.
- **Integração futura possível**: dados fiscais validados pelo `tax`
  (NF-e verificada, compliance) poderiam alimentar a emissão de
  passaportes no P1 — via API assinada, sem acoplamento de banco.
- **Ação**: manter repo separado e ativo; nenhuma consolidação necessária.

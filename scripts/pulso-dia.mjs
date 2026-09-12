#!/usr/bin/env node
// Pulso do dia — produtividade do time (humano + agentes) do reembolsa.ia.
//
// Headline: ENTREGAS LIMPAS — deploys/releases promovidos em produção hoje,
// com veredito APTO e zero rollback. Mede saída, não atividade: commit e
// linha de código são meio; valor em produção sem retrabalho é o fim.
//
// Vitais de guarda (a headline não pode subir às custas deles):
//   1. WIP parado      — trabalho não mergeado há > 24h (meta: 0)
//   2. Lead time       — primeiro commit do dia → última tag do dia
//   3. Retrabalho      — rodadas de revisão + resgates no dia
//   4. Telemetria      — runs fechados ÷ deploys (meta: 100%)
//   5. Modo degradado  — % de runs com exceções F1–F4 (meta: 0%)
//
// Uso: node scripts/pulso-dia.mjs [AAAA-MM-DD]   (padrão: hoje)

import { execSync } from 'node:child_process'
import { readFileSync, readdirSync, existsSync } from 'node:fs'

const repo = process.cwd()
const dia = process.argv[2] ?? new Date().toLocaleDateString('sv') // local, AAAA-MM-DD
const sh = (cmd) => { try { return execSync(cmd, { cwd: repo, encoding: 'utf8' }).trim() } catch { return '' } }

// ── Commits e tags do dia ─────────────────────────────────────────────────
const commits = sh(`git log --since="${dia} 00:00" --until="${dia} 23:59:59" --format='%H|%aI|%s'`)
  .split('\n').filter(Boolean).map(l => { const [h, d, ...s] = l.split('|'); return { h, d, s: s.join('|') } })
const tagsHoje = sh(`git tag --format='%(creatordate:short)|%(refname:short)'`)
  .split('\n').filter(l => l.startsWith(dia)).map(l => l.split('|')[1])

// ── Runs da pipeline ──────────────────────────────────────────────────────
const runsDir = `${repo}/pipeline/runs`
const runs = existsSync(runsDir)
  ? readdirSync(runsDir).filter(f => f.endsWith('.json')).map(f => {
      try { return JSON.parse(readFileSync(`${runsDir}/${f}`, 'utf8')) } catch { return null }
    }).filter(r => r && (r.criadoEm ?? '').startsWith(dia))
  : []
const runsFechados = runs.filter(r => r.status === 'concluido')
const runsAptos = runs.filter(r => r.vereditoMecanico === 'APTO' || r.veredito === 'APTO')
const runsDegradados = runs.filter(r => (r.excecoes ?? []).some(e => /modo degradado/i.test(e)))
const rodadasRevisao = runs.reduce((acc, r) => acc + (r.rodadasRevisao ?? 0), 0)
const rollbacks = runs.filter(r => r.rollback).length

// index.jsonl: cobertura do índice
const idxPath = `${runsDir}/index.jsonl`
const idxHoje = existsSync(idxPath)
  ? readFileSync(idxPath, 'utf8').split('\n').filter(Boolean)
      .map(l => { try { return JSON.parse(l) } catch { return null } })
      .filter(r => r && (r.runId ?? '').includes(dia.replaceAll('-', ''))).length
  : 0

// ── WIP parado: branches não mergeadas + worktrees ────────────────────────
const naoMergeadas = sh(`git branch --no-merged HEAD --format='%(refname:short)|%(committerdate:iso)'`)
  .split('\n').filter(Boolean).map(l => { const [b, d] = l.split('|'); return { b, d } })
const agora = Date.now()
const wipParado = naoMergeadas.map(({ b, d }) => ({ b, horas: (agora - new Date(d)) / 36e5 }))
  .filter(w => w.horas > 24 && w.b !== 'main')
const worktrees = sh('git worktree list').split('\n').filter(l => l.includes('.claude/worktrees')).length

// ── Backlog ───────────────────────────────────────────────────────────────
const briefsDir = `${repo}/pipeline/briefs`
const briefs = existsSync(briefsDir) ? readdirSync(briefsDir).filter(f => f.endsWith('.json')).length : 0

// ── Headline: entregas limpas ─────────────────────────────────────────────
const deploys = Math.max(tagsHoje.length, runsFechados.length)
const entregasLimpas = Math.max(tagsHoje.length, runsAptos.length) - rollbacks

// Lead time: primeiro commit → última tag do dia (se houve tag)
let leadTime = '—'
if (commits.length && tagsHoje.length) {
  const primeiro = new Date(commits.at(-1).d)
  const ultimaTag = sh(`git log -1 --format='%cI' ${tagsHoje.at(-1)}`)
  if (ultimaTag) leadTime = `${((new Date(ultimaTag) - primeiro) / 36e5).toFixed(1)}h`
}

// ── Relatório ─────────────────────────────────────────────────────────────
const ok = (cond) => (cond ? '✅' : '⚠️')
console.log(`# Pulso do dia — ${dia}

## Headline
**Entregas limpas: ${entregasLimpas}** (deploys/releases promovidos, APTO, sem rollback)

## Vitais de guarda
- ${ok(wipParado.length === 0)} **WIP parado > 24h:** ${wipParado.length}${wipParado.length ? ' — ' + wipParado.map(w => `${w.b} (${Math.floor(w.horas)}h)`).join(', ') : ''} (meta: 0)
- **Lead time do dia:** ${leadTime} (primeiro commit → última tag)
- **Retrabalho:** ${rodadasRevisao} rodada(s) de revisão registrada(s)
- ${ok(runs.length === 0 || runsFechados.length === runs.length)} **Telemetria:** ${runsFechados.length}/${runs.length} runs fechados, ${idxHoje} no index.jsonl (meta: 100%)
- ${ok(runsDegradados.length === 0)} **Modo degradado:** ${runs.length ? Math.round(runsDegradados.length / runs.length * 100) : 0}% dos runs (${runsDegradados.length}/${runs.length}) (meta: 0%)

## Atividade (contexto, não meta)
- ${commits.length} commits · ${tagsHoje.length} tags (${tagsHoje.join(', ') || '—'}) · ${worktrees} worktrees vivos · backlog: ${briefs} briefs

## Leitura
Entrega limpa é deploy que fica de pé. WIP parado é trabalho pago apodrecendo
(precedentes: wf_fff958d1 virou resgate; a 0010 ficou 1 dia esquecida em
worktree). Telemetria < 100% significa decisão sem rastro.`)

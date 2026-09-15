#!/usr/bin/env node
import { gravarDashboardIa } from './limite-consultas.mjs';

const ledgerBase = process.env.POC_CALLS_LEDGER;
const arquivoUso = process.env.POC_AI_USAGE_LEDGER ?? (ledgerBase ? `${ledgerBase}.ai-usage.jsonl` : undefined);
const arquivoSaida = process.env.POC_AI_DASHBOARD_FILE ?? (ledgerBase ? `${ledgerBase}.ai-dashboard.json` : undefined);

if (!arquivoUso || !arquivoSaida) {
  console.error('Defina POC_AI_USAGE_LEDGER e POC_AI_DASHBOARD_FILE, ou POC_CALLS_LEDGER.');
  process.exitCode = 2;
} else {
  const dashboard = gravarDashboardIa(arquivoUso, arquivoSaida);
  console.log(JSON.stringify({
    artefato: arquivoSaida,
    geradoEm: dashboard.geradoEm,
    janelaMinutos: dashboard.janelaMinutos,
    janelas: dashboard.janelas.length,
  }));
}

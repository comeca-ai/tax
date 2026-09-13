import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const plan = JSON.parse(fs.readFileSync("docs/poc/backlog.json", "utf8"));
const repo = "comeca-ai/projeto_tribureembolsa";
const branch = "docs/360dialog-canal-unico";
const reportPath = "docs/poc/publicacao-github.json";
const root = `https://github.com/${repo}`;
const blob = `${root}/blob/${branch}/`;
assert.equal(plan.repository, repo);
assert.equal(plan.branch, branch);
const ids = new Set(plan.issues.map(i => i.id));
assert.equal(ids.size, plan.issues.length, "IDs duplicados");
const phases = new Set(plan.phases.map(p => p.id));
assert.equal(phases.size, plan.phases.length, "Marcos duplicados");
for (const item of [plan.epic, ...plan.issues]) {
  assert.match(item.file, /^docs\/poc\/[a-zA-Z0-9_./-]+\.md$/);
  assert(!item.file.includes(".."));
  assert(fs.existsSync(item.file), `Arquivo ausente: ${item.file}`);
}
const visiting = new Set();
const visited = new Set();
function visit(id) {
  assert(ids.has(id), `Dependência desconhecida: ${id}`);
  assert(!visiting.has(id), `Ciclo em ${id}`);
  if (visited.has(id)) return;
  visiting.add(id);
  const item = plan.issues.find(i => i.id === id);
  assert(phases.has(item.phase), `Marco desconhecido em ${id}`);
  assert(["P0", "P1"].includes(item.priority));
  item.dependsOn.forEach(visit);
  visiting.delete(id);
  visited.add(id);
}
plan.issues.forEach(i => visit(i.id));
console.log(`Planejamento válido: ${plan.phases.length} marcos e ${plan.issues.length} entregas; dependências sem ciclos.`);

async function api(endpoint, method = "GET", data) {
  const response = await fetch(`https://api.github.com/repos/${repo}/${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: data === undefined ? undefined : JSON.stringify(data),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    const error = new Error(`GitHub ${method} ${endpoint}: HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.status === 204 ? null : response.json();
}

async function list(endpoint) {
  const items = [];
  for (let page = 1; ; page++) {
    const chunk = await api(`${endpoint}${endpoint.includes("?") ? "&" : "?"}per_page=100&page=${page}`);
    items.push(...chunk);
    if (chunk.length < 100) return items;
  }
}

const start = id => `<!-- ${plan.version}:${id}:inicio -->`;
const end = id => `<!-- ${plan.version}:${id}:fim -->`;
const wrap = (id, text) => `${start(id)}\n${text}\n${end(id)}`;
function markdown(file) {
  // Links relativos de documentos precisam funcionar também no corpo da issue.
  return fs.readFileSync(file, "utf8").replace(/\]\(([^)]+)\)/g, (all, dest) => {
    if (/^(?:https?:|#)/.test(dest)) return all;
    const [target, anchor] = dest.split("#");
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), target));
    return `](${blob}${resolved}${anchor ? `#${anchor}` : ""})`;
  });
}

async function publishPlan() {
  const result = {
    version: plan.version,
    status: "em_execucao",
    sourceCommit: process.env.GITHUB_SHA,
    run: `${root}/actions/runs/${process.env.GITHUB_RUN_ID}`,
    milestones: [], issues: [], warnings: [],
  };
  try {
    const labels = await list("labels");
    for (const label of [
      { name: "poc", color: "0E8A16", description: "Roadmap de campo e combustível" },
      { name: "poc:P0", color: "B60205", description: "Caminho principal da POC" },
      { name: "poc:P1", color: "D4C5F9", description: "Execução após pré-requisitos; aceite continua obrigatório" },
    ]) {
      if (!labels.some(l => l.name === label.name)) await api("labels", "POST", label);
    }
    const milestones = await list("milestones?state=all");
    const byPhase = {};
    for (const phase of plan.phases) {
      const milestone = milestones.find(m => m.title === phase.title)
        ?? await api("milestones", "POST", { title: phase.title, description: phase.description });
      byPhase[phase.id] = milestone.number;
      result.milestones.push({ id: phase.id, number: milestone.number, url: milestone.html_url });
    }

    const existing = (await list("issues?state=all")).filter(i => !i.pull_request);
    async function ensure(id, title, body, milestone, priority) {
      const found = existing.find(i => (i.body ?? "").includes(start(id)) || i.title === title);
      if (found) return found;
      const issue = await api("issues", "POST", {
        title, body: wrap(id, body), milestone,
        labels: priority ? ["poc", `poc:${priority}`] : ["poc"],
      });
      existing.push(issue);
      return issue;
    }
    async function updateBlock(issue, id, body) {
      const latest = await api(`issues/${issue.number}`);
      const old = latest.body ?? "";
      const from = old.indexOf(start(id));
      const to = old.indexOf(end(id), from);
      // Issues sem nosso marcador são reutilizadas, nunca sobrescritas.
      if (from < 0 || to < 0) return;
      const updated = old.slice(0, from) + wrap(id, body) + old.slice(to + end(id).length);
      if (updated !== old) await api(`issues/${issue.number}`, "PATCH", { body: updated });
    }

    const epic = await ensure("EPIC", plan.epic.title, markdown(plan.epic.file), undefined, undefined);
    result.epic = { number: epic.number, url: epic.html_url };
    const byId = {};
    for (const item of plan.issues) {
      const issue = await ensure(item.id, item.title, markdown(item.file), byPhase[item.phase], item.priority);
      byId[item.id] = issue;
      result.issues.push({ id: item.id, number: issue.number, url: issue.html_url, state: issue.state });
    }
    for (const item of plan.issues) {
      const deps = item.dependsOn.map(id => `- [${id} · #${byId[id].number}](${byId[id].html_url})`).join("\n");
      const body = `${markdown(item.file)}\n\n## Acompanhamento no GitHub\n\nÉpico: #${epic.number}.\n\n${deps ? `Dependências de entrega:\n\n${deps}` : "Pode iniciar sem dependência de outra entrega."}\n\nO estado das dependências deve ser conferido nas issues; não é atualizado por este script.`;
      await updateBlock(byId[item.id], item.id, body);
    }
    const checklist = plan.phases.map(phase => {
      const lines = plan.issues.filter(i => i.phase === phase.id).map(i => {
        const issue = byId[i.id];
        return `- [${issue.state === "closed" ? "x" : " "}] #${issue.number} — ${i.id}: ${i.title.replace(/^\[[^\]]+\] /, "")}`;
      });
      return `### ${phase.title}\n\n${lines.join("\n")}`;
    }).join("\n\n");
    await updateBlock(epic, "EPIC", `${markdown(plan.epic.file)}\n\n## Entregas publicadas\n\n${checklist}`);

    const pulls = await list("pulls?state=open");
    let pull = pulls.find(p => p.head.ref === branch && p.base.ref === "main");
    if (!pull) {
      try {
        pull = await api("pulls", "POST", {
          title: "docs(poc): consolidar campo, combustível, hierarquia e aceite",
          head: branch, base: "main",
          body: `## Contexto\n\nO plano anterior encerrava o escopo em comprovantes. O novo roadmap inclui jornadas, Google Maps, conciliação e cobrança de notas no CNPJ do empregador. Cargos, responsabilidades e autorização de automação são derivados da política validada (D-024).\n\n## Alteração\n\nCinco marcos, ${plan.issues.length} entregas com critérios e dependências, desenho de topologia e diagnóstico de hierarquia. Refs #${epic.number}. PR #17 já integrado à base.\n\n## Validação\n\nManifesto, arquivos e dependências validados pelo publicador. A execução de CI deste PR deve ser conferida no GitHub; este planejamento não declara o produto homologado.\n\n## Impacto e reversão\n\nSem alteração de runtime, permissões da aplicação ou esquema. Publicação pontual usa o token temporário do Actions, sem merge/deploy/proteção de main. Reverter a documentação não remove issues; encerrar/replanejar o backlog é ato separado.`,
        });
      } catch (error) {
        if (![403, 422].includes(error.status)) throw error;
        result.warnings.push(`PR não criado automaticamente: HTTP ${error.status}; conferir configuração de criação de PR pelo Actions.`);
      }
    }
    result.pullRequest = pull ? { number: pull.number, url: pull.html_url } : null;
    result.compare = `${root}/compare/main...${branch}?expand=1`;
    result.status = "publicado";
  } catch (error) {
    result.status = "falhou";
    result.warnings.push(error.message);
    process.exitCode = 1;
  }
  // O relatório é o único arquivo alterado pela automação, nesta branch.
  // Preserva alterações humanas fora dos blocos de texto gerenciados nas issues.
  const previous = await api(`contents/${reportPath}?ref=${encodeURIComponent(branch)}`).catch(error => {
    if (error.status === 404) return null;
    throw error;
  });
  await api(`contents/${reportPath}`, "PUT", {
    message: "docs(poc): registrar publicacao do roadmap no GitHub",
    branch,
    content: Buffer.from(JSON.stringify(result, null, 2) + "\n").toString("base64"),
    ...(previous ? { sha: previous.sha } : {}),
  });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv.includes("--publish")) {
  assert.equal(process.env.GITHUB_ACTIONS, "true", "Publicação disponível somente no workflow autorizado");
  assert.equal(process.env.GITHUB_REPOSITORY, repo);
  assert.equal(process.env.GITHUB_REF, `refs/heads/${branch}`);
  assert(process.env.GITHUB_TOKEN, "Token temporário ausente");
  await publishPlan();
}

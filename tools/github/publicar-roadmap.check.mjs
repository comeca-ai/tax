import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("publicação simulada: reexecução, preservação e PR sem permissão", async () => {
  const plan = JSON.parse(fs.readFileSync("docs/poc/backlog.json", "utf8"));
  const originalFetch = globalThis.fetch;
  const originalLog = console.log;
  const originalArgs = [...process.argv];
  const originalEnv = { ...process.env };
  const labels = [{ name: "manual" }];
  const milestones = [];
  const unrelated = { number: 1, title: "Trabalho existente", body: "Preservar", state: "open" };
  const issues = [structuredClone(unrelated)];
  const pulls = [];
  const writes = [];
  let report;
  let denyPull = true;
  const answer = (value, status = 200) => new Response(JSON.stringify(value), { status });
  globalThis.fetch = async (url, options) => {
    const parsed = new URL(url);
    const prefix = `/repos/${plan.repository}/`;
    assert.equal(parsed.origin, "https://api.github.com");
    assert(parsed.pathname.startsWith(prefix));
    const endpoint = parsed.pathname.slice(prefix.length);
    const method = options.method;
    const body = options.body === undefined ? undefined : JSON.parse(options.body);
    if (method !== "GET") writes.push({ endpoint, method, body });
    for (const [name, items] of Object.entries({ labels, milestones, issues, pulls })) {
      if (endpoint !== name) continue;
      if (method === "GET") return answer(items);
      assert.equal(method, "POST");
      if (name === "pulls" && denyPull) return answer({ message: "Forbidden" }, 403);
      const number = items.length + 1;
      const item = {
        ...body, number, state: "open",
        html_url: `https://github.com/${plan.repository}/${name}/${number}`,
        ...(name === "pulls" ? { head: { ref: body.head }, base: { ref: body.base } } : {}),
      };
      items.push(item);
      return answer(item, 201);
    }
    if (/^issues\/\d+$/.test(endpoint)) {
      const issue = issues.find(i => i.number === Number(endpoint.split("/")[1]));
      assert(issue);
      if (method === "PATCH") Object.assign(issue, body);
      else assert.equal(method, "GET");
      return answer(issue);
    }
    if (endpoint === "contents/docs/poc/publicacao-github.json") {
      if (method === "GET") {
        assert.equal(parsed.searchParams.get("ref"), plan.branch);
        return answer({ sha: "report-sha" });
      }
      assert.equal(method, "PUT");
      assert.equal(body.branch, plan.branch);
      assert.equal(body.sha, "report-sha");
      report = JSON.parse(Buffer.from(body.content, "base64").toString());
      return answer({ content: { sha: "report-sha" } });
    }
    assert.fail(`Requisição inesperada: ${method} ${endpoint}`);
  };
  console.log = () => {};
  process.argv.push("--publish");
  Object.assign(process.env, {
    GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: plan.repository,
    GITHUB_REF: `refs/heads/${plan.branch}`, GITHUB_TOKEN: "simulated-no-network",
    GITHUB_SHA: "test-commit", GITHUB_RUN_ID: "test-run",
  });
  try {
    await import("./publicar-roadmap.mjs?test=1");
    assert.equal(report.status, "publicado");
    assert.equal(report.issues.length, 17);
    assert.equal(report.milestones.length, 5);
    assert.equal(report.pullRequest, null);
    assert.match(report.warnings[0], /403/);
    assert.equal(issues.length, 19); // Um preexistente, um épico e 17 entregas.
    assert.deepEqual(issues[0], unrelated);
    const child = issues.find(i => i.title === plan.issues[0].title);
    child.state = "closed";
    child.body = `Observação humana antes\n${child.body}\nObservação humana depois`;
    denyPull = false;
    await import("./publicar-roadmap.mjs?test=2");
    assert.equal(report.status, "publicado");
    assert.equal(issues.length, 19);
    assert.equal(milestones.length, 5);
    assert.equal(labels.length, 4);
    assert.equal(pulls.length, 1);
    assert.equal(child.state, "closed");
    assert(child.body.startsWith("Observação humana antes\n"));
    assert(child.body.endsWith("\nObservação humana depois"));
    assert.deepEqual(issues[0], unrelated);
    const epic = issues.find(i => i.number === report.epic.number);
    assert(epic.body.includes(`- [x] #${child.number}`));
    const last = issues.find(i => i.title === plan.issues.at(-1).title);
    assert(last.body.includes("Acompanhamento no GitHub"));
    assert(last.body.includes(`/blob/${plan.branch}/docs/poc/REVISAO-HIERARQUIA.md`));
    await import("./publicar-roadmap.mjs?test=3");
    assert.equal(pulls.length, 1);
    assert.equal(issues.length, 19);
    assert.equal(writes.filter(w => w.method === "PUT").length, 3);
    assert(writes.every(w => !["DELETE"].includes(w.method)));
    const before = writes.length;
    process.env.GITHUB_REF = "refs/heads/main";
    await assert.rejects(import("./publicar-roadmap.mjs?test=guard"), /AssertionError/);
    assert.equal(writes.length, before);
  } finally {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
    process.argv = originalArgs;
    for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { safeDatabase, localBrowserRequest } from "./browser-smoke-guards.mjs";

test("only exact isolated DB is accepted before writes", () => {
  assert.equal(
    safeDatabase("mysql://fixture:dummy@127.0.0.1/reembolsa_poc_test_20260913")
      .hostname,
    "127.0.0.1"
  );
  for (const url of [
    "mysql://fixture:dummy@127.0.0.1/production",
    "mysql://fixture:dummy@db.example.invalid/reembolsa_poc_test_20260913",
    "mysql://fixture:dummy@127.0.0.1/reembolsa_poc_test_other",
    "https://127.0.0.1/reembolsa_poc_test_20260913",
  ])
    assert.throws(() => safeDatabase(url));
});
test("browser cannot reach providers, alternate local services or credential-host tricks", () => {
  assert.equal(localBrowserRequest("http://127.0.0.1:3199/api/health"), true);
  for (const url of [
    "https://waba-v2.360dialog.io/messages",
    "http://127.0.0.1:3000/api/health",
    "http://127.0.0.1:3199@evil.example.invalid/",
    "file:///etc/passwd",
    "http://localhost:3199/",
    "not a URL",
  ])
    assert.equal(localBrowserRequest(url), false);
});

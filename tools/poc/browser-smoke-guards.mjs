import assert from "node:assert/strict";

export const TEST_ORIGIN = "http://127.0.0.1:3199";
export const TEST_DATABASE = "reembolsa_poc_test_20260913";

export function safeDatabase(raw) {
  const url = new URL(raw);
  assert.equal(url.protocol, "mysql:");
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname));
  assert.equal(url.pathname, `/${TEST_DATABASE}`);
  return url;
}

export function localBrowserRequest(raw) {
  try {
    return new URL(raw).origin === TEST_ORIGIN;
  } catch {
    return false;
  }
}

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const workflowDirectory = '.github/workflows';
const workflows = fs.readdirSync(workflowDirectory)
  .filter(file => file.endsWith('.yml'))
  .map(file => ({ file, source: fs.readFileSync(path.join(workflowDirectory, file), 'utf8') }));

test('actions externas usam SHA completo e permissões são explícitas', () => {
  for (const { file, source } of workflows) {
    assert.match(source, /^permissions:/m, `${file}: permissions ausente`);
    for (const match of source.matchAll(/^\s*uses:\s*([^\s#]+)(?:\s*#.*)?$/gm)) {
      const reference = match[1];
      assert.match(reference, /@[0-9a-f]{40}$/, `${file}: action não fixada por SHA: ${reference}`);
    }
  }
});

test('workflows com credenciais 360dialog não executam automaticamente', () => {
  for (const { file, source } of workflows.filter(item => item.source.includes('DIALOG_360_'))) {
    assert.match(source, /^\s{2}workflow_dispatch:/m, `${file}: workflow_dispatch ausente`);
    assert.doesNotMatch(source, /^\s{2}(push|pull_request|schedule):/m,
      `${file}: credenciais não podem ser usadas por evento automático`);
    assert.match(source, /environment:\s*homologacao/, `${file}: environment homologacao ausente`);
    assert.match(source, /refs\/heads\/main/, `${file}: execução fora da main`);
  }
});

test('consulta da 360dialog não escreve no repositório', () => {
  const source = workflows.find(item => item.file === 'verificar-360dialog-readonly.yml')?.source ?? '';
  assert.doesNotMatch(source, /contents:\s*write/);
  assert.match(source, /contents:\s*read/);
  assert.match(source, /actions\/upload-artifact@[0-9a-f]{40}/);
  assert.match(source, /providerMutation:\s*false/);
  assert.match(source, /messageSent:\s*false/);
});

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('build preflight requires the shared origin and key without leaking their values', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'pray-env-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, '.env');
  const script = fileURLToPath(new URL('../../scripts/validate-runtime-env.mjs', import.meta.url));
  const cases = [
    ['EXPO_PUBLIC_API_URL="https://api.test/"\nEXPO_PUBLIC_AI_PROXY_KEY="test-secret"', 0],
    ['EXPO_PUBLIC_API_URL=http://localhost:9084\nEXPO_PUBLIC_AI_PROXY_KEY=test-secret', 0],
    ['EXPO_PUBLIC_AI_PROXY_URL=https://api.test/api/ai/question\nEXPO_PUBLIC_AI_PROXY_KEY=test-secret', 1],
    ['EXPO_PUBLIC_API_URL=https://api.test/api/ai/question\nEXPO_PUBLIC_AI_PROXY_KEY=test-secret', 1],
    ['EXPO_PUBLIC_API_URL=https://api.test\nEXPO_PUBLIC_AI_PROXY_KEY=" "', 1],
  ];
  for (const [source, expected] of cases) {
    writeFileSync(path, source);
    const result = spawnSync(process.execPath, [
      '--experimental-strip-types', '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', script, path,
    ], { encoding: 'utf8' });
    assert.equal(result.status, expected, result.stderr);
    assert.doesNotMatch(result.stdout + result.stderr, /test-secret|api\.test|localhost/);
  }
});

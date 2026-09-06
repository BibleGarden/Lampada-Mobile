import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

function fixture(t, version) {
  const root = mkdtempSync(join(tmpdir(), 'pray-version-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'scripts'));
  const script = join(root, 'scripts/bump-version.mjs');
  copyFileSync(new URL('../../scripts/bump-version.mjs', import.meta.url), script);
  const path = join(root, 'app.json');
  const config = { expo: { version, name: 'Lampada', ios: { buildNumber: '42' } } };
  writeFileSync(path, JSON.stringify(config));
  return {
    config,
    read: () => JSON.parse(readFileSync(path, 'utf8')),
    run: () => spawnSync(process.execPath, [script], { cwd: tmpdir(), encoding: 'utf8' }),
  };
}

test('successive build attempts reserve new patch versions and preserve unrelated config', (t) => {
  const f = fixture(t, '1.0');
  for (const expected of ['1.0.1', '1.0.2']) {
    const result = f.run();
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(f.read(), { expo: { ...f.config.expo, version: expected } });
  }
});

test('patch increments beyond nine without changing major or minor', (t) => {
  const f = fixture(t, '2.7.9');
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(f.read().expo.version, '2.7.10');
});

for (const version of ['1', '1.2.beta', '1.2.3.4', '1.2.9007199254740991', null]) {
  test(`invalid version ${version} fails without changing config`, (t) => {
    const f = fixture(t, version);
    assert.notEqual(f.run().status, 0);
    assert.deepEqual(f.read(), f.config);
  });
}

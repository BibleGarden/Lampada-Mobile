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
    run: (...args) => spawnSync(process.execPath, [script, ...args], { cwd: tmpdir(), encoding: 'utf8' }),
  };
}

function expectVersions(t, start, steps) {
  const f = fixture(t, start);
  for (const [mode, expected] of steps) {
    const result = f.run(mode);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(f.read(), { expo: { ...f.config.expo, version: expected } });
  }
}

test('test builds reserve patches of the current release and preserve unrelated config', (t) => {
  expectVersions(t, '1.1', [['test', '1.1.1'], ['test', '1.1.2']]);
});

test('a release build drops the patch and raises the minor', (t) => {
  expectVersions(t, '1.0.26', [['release', '1.1'], ['test', '1.1.1'], ['release', '1.2'], ['release', '1.3']]);
});

test('components increment beyond nine without changing major', (t) => {
  expectVersions(t, '2.9.9', [['test', '2.9.10'], ['release', '2.10']]);
});

for (const version of ['1', '1.2.beta', '1.2.3.4', '1.2.9007199254740991', null]) {
  test(`invalid version ${version} fails without changing config`, (t) => {
    const f = fixture(t, version);
    assert.notEqual(f.run('test').status, 0);
    assert.deepEqual(f.read(), f.config);
  });
}

for (const args of [[], ['patch']]) {
  test(`missing or unknown mode ${args.join(' ') || '(none)'} fails without changing config`, (t) => {
    const f = fixture(t, '1.1');
    assert.notEqual(f.run(...args).status, 0);
    assert.deepEqual(f.read(), f.config);
  });
}

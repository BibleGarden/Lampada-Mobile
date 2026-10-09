import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createRequire } from 'node:module';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
const { runtimeMetadataNames } = require('../../plugins/withAndroidBuild.js');
const origin = 'http://192.0.2.10:9084';

function harness(t, { channel = 'test', api = origin, metadata = true, environmentExit = 0 } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'lampada-android-runner-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const dir of ['bin', 'scripts', 'plugins', 'testing/android-e2e']) mkdirSync(join(root, dir), { recursive: true });
  for (const file of ['test-android.sh', 'test-android-critical.sh', 'validate-installed-android.mjs']) {
    copyFileSync(join(repo, 'scripts', file), join(root, 'scripts', file));
  }
  copyFileSync(join(repo, 'plugins/withAndroidBuild.js'), join(root, 'plugins/withAndroidBuild.js'));
  symlinkSync(join(repo, 'node_modules'), join(root, 'node_modules'));
  for (const file of readdirSync(join(repo, 'testing/android-e2e')).filter((name) => name.endsWith('.yaml'))) {
    copyFileSync(join(repo, 'testing/android-e2e', file), join(root, 'testing/android-e2e', file));
  }
  writeFileSync(join(root, '.env.local'), `EXPO_PUBLIC_API_URL=${origin}\nEXPO_PUBLIC_AI_PROXY_KEY=dummy-test-key\n`);
  const entries = metadata ? `<meta-data android:name="${runtimeMetadataNames.channel}" android:value="${channel}"/><meta-data android:name="${runtimeMetadataNames.apiOrigin}" android:value="${api}"/>` : '';
  const manifest = join(root, 'manifest.xml');
  writeFileSync(manifest, `<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.nf404.twinkler"><application android:name=".MainApplication">${entries}</application></manifest>`);
  const events = join(root, 'events.log');
  const mock = (name, body) => writeFileSync(join(root, 'bin', name), `#!/usr/bin/env bash\nset -euo pipefail\nprintf '%s\\n' "${name} $*" >> "$RUNNER_EVENTS"\n${body}\n`, { mode: 0o755 });
  mock('adb', `case "$*" in
    *'shell getprop sys.boot_completed') echo 1 ;;
    *'shell dumpsys package com.nf404.twinkler') echo 'versionName=1.3.6' ;;
    *'shell pm path com.nf404.twinkler') echo 'package:/data/app/lampada/base.apk' ;;
    *'pull /data/app/lampada/base.apk '*) touch "$5" ;;
    *'shell settings get system system_locales') echo ru-RU ;;
    *) echo 'Unexpected device operation' >&2; exit 90 ;;
  esac`);
  mock('apkanalyzer', 'cat "$RUNNER_MANIFEST"');
  mock('npm', 'exit "$RUNNER_ENV_EXIT"');
  mock('node', 'exec "$RUNNER_REAL_NODE" "$@"');
  mock('maestro', 'exit "$RUNNER_MAESTRO_EXIT"');
  mock('python3', 'exit "$RUNNER_CONTRACT_EXIT"');
  return {
    root,
    run(script, flows = [], extra = {}) {
      const output = join(root, 'output');
      const result = spawnSync('/bin/bash', [join(root, 'scripts', script), ...flows], {
        encoding: 'utf8',
        env: { ...process.env, PATH: join(root, 'bin') + ':' + process.env.PATH,
          ANDROID_TEST_DEVICE: 'mock-device', ANDROID_TEST_OUTPUT_DIR: output,
          RUNNER_EVENTS: events, RUNNER_MANIFEST: manifest, RUNNER_REAL_NODE: process.execPath,
          RUNNER_ENV_EXIT: String(environmentExit), RUNNER_MAESTRO_EXIT: '0', RUNNER_CONTRACT_EXIT: '0', ...extra },
      });
      return { ...result, output, events: existsSync(events) ? readFileSync(events, 'utf8') : '' };
    },
  };
}

test('individual Android flows reject unsafe installed APKs before Maestro and remove the APK copy', (t) => {
  for (const options of [
    { channel: 'store' }, { metadata: false }, { api: 'https://old-test.example.com' },
    { api: 'https://api.bible.garden' },
  ]) {
    const h = harness(t, options);
    const result = h.run('test-android.sh', ['android-ans-024-recordings-keyboard']);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.events, /validate-installed-android\.mjs/);
    assert.doesNotMatch(result.events, /^maestro /m);
    assert.doesNotMatch(result.events, /am start|pm clear/);
    assert.equal(existsSync(join(result.output, 'installed-base.apk')), false);
  }
});

test('a valid individual flow reaches Maestro only after installed metadata validation', (t) => {
  const result = harness(t).run('test-android.sh', ['android-ans-024-recordings-keyboard']);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const validate = result.events.indexOf('validate-installed-android.mjs');
  const maestro = result.events.indexOf('maestro --device mock-device test');
  assert.ok(validate >= 0 && maestro > validate);
  assert.equal(readFileSync(join(result.output, 'results.tsv'), 'utf8'), 'flow\texit\nandroid-ans-024-recordings-keyboard\t0\n');
  assert.equal(existsSync(join(result.output, 'installed-base.apk')), false);
});

test('critical wrapper uses the same preflight, preserves all ten entries and smoke/relaunch order', (t) => {
  const rejected = harness(t, { channel: 'store' }).run('test-android-critical.sh');
  assert.equal(rejected.status, 1, rejected.stdout + rejected.stderr);
  assert.doesNotMatch(rejected.events, /^maestro /m);
  const valid = harness(t).run('test-android-critical.sh');
  assert.equal(valid.status, 0, valid.stdout + valid.stderr);
  const rows = readFileSync(join(valid.output, 'results.tsv'), 'utf8').trim().split('\n').slice(1);
  assert.equal(rows.length, 10);
  assert.deepEqual(rows.slice(-2), ['android-smoke-full\t0', 'android-smoke-full-relaunch\t0']);
  const native = valid.events.indexOf('python3 scripts/run-keyboard-contract.py');
  assert.ok(native > valid.events.indexOf('testing/android-e2e/android-smoke-full-relaunch.yaml'));
  assert.match(valid.events, /python3 scripts\/run-keyboard-contract\.py --device mock-device --mode docked --output .*keyboard-contract-docked/);
  assert.doesNotMatch(rejected.events, /^python3 /m);
});

test('missing environment and invalid flow names never reach Maestro', (t) => {
  const invalidEnv = harness(t, { environmentExit: 7 }).run('test-android.sh', ['android-ans-024-recordings-keyboard']);
  assert.equal(invalidEnv.status, 7, invalidEnv.stdout + invalidEnv.stderr);
  assert.doesNotMatch(invalidEnv.events, /^adb |^maestro /m);
  for (const names of [[], ['../e2e/ios-smoke-full'], ['missing-flow']]) {
    const result = harness(t).run('test-android.sh', names);
    assert.equal(result.status, 2, result.stdout + result.stderr);
    assert.equal(result.events, '');
  }
});

test('shared runner stops at the first failure without invoking subsequent flows', (t) => {
  const result = harness(t).run('test-android.sh', ['android-smoke-full', 'android-smoke-full-relaunch'], { RUNNER_MAESTRO_EXIT: '5' });
  assert.equal(result.status, 5, result.stdout + result.stderr);
  assert.equal((result.events.match(/^maestro /gm) ?? []).length, 1);
  assert.equal(readFileSync(join(result.output, 'android-smoke-full.exit'), 'utf8'), '5\n');
});

test('critical gate propagates native geometry failure and never reaches it after a failed flow', (t) => {
  const bounds = harness(t).run('test-android-critical.sh', [], { RUNNER_CONTRACT_EXIT: '9' });
  assert.equal(bounds.status, 9, bounds.stdout + bounds.stderr);
  assert.equal((bounds.events.match(/^python3 /gm) ?? []).length, 1);
  const flow = harness(t).run('test-android-critical.sh', [], { RUNNER_MAESTRO_EXIT: '5' });
  assert.equal(flow.status, 5, flow.stdout + flow.stderr);
  assert.doesNotMatch(flow.events, /^python3 /m);
});

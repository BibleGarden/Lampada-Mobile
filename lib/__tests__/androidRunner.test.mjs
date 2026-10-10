import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
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
  for (const dir of ['bin', 'lib', 'scripts', 'plugins', 'testing/android-e2e']) mkdirSync(join(root, dir), { recursive: true });
  for (const file of ['test-android.sh', 'test-android-critical.sh', 'validate-installed-android.mjs', 'android-guest-load.mjs',
    'android-maestro-driver.sh']) {
    copyFileSync(join(repo, 'scripts', file), join(root, 'scripts', file));
  }
  copyFileSync(join(repo, 'plugins/withAndroidBuild.js'), join(root, 'plugins/withAndroidBuild.js'));
  symlinkSync(join(repo, 'node_modules'), join(root, 'node_modules'));
  for (const file of readdirSync(join(repo, 'testing/android-e2e')).filter((name) => name.endsWith('.yaml'))) {
    copyFileSync(join(repo, 'testing/android-e2e', file), join(root, 'testing/android-e2e', file));
  }
  writeFileSync(join(root, 'lib/maestro-client.jar'), '');
  writeFileSync(join(root, '.env.local'), `EXPO_PUBLIC_API_URL=${origin}\nEXPO_PUBLIC_AI_PROXY_KEY=dummy-test-key\n`);
  const entries = metadata ? `<meta-data android:name="${runtimeMetadataNames.channel}" android:value="${channel}"/><meta-data android:name="${runtimeMetadataNames.apiOrigin}" android:value="${api}"/>` : '';
  const manifest = join(root, 'manifest.xml');
  writeFileSync(manifest, `<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.nf404.twinkler"><application android:name=".MainApplication">${entries}</application></manifest>`);
  const events = join(root, 'events.log');
  const mock = (name, body) => writeFileSync(join(root, 'bin', name), `#!/usr/bin/env bash\nset -euo pipefail\nprintf '%s\\n' "${name} $*" >> "$RUNNER_EVENTS"\n${body}\n`, { mode: 0o755 });
  mock('adb', `case "$*" in
    *'shell getprop sys.boot_completed') echo 1 ;;
    *'shell cat /proc/uptime') echo "$RUNNER_UPTIME 900.00" ;;
    *'shell cat /proc/loadavg')
      samples="$(grep -c 'cat /proc/loadavg' "$RUNNER_EVENTS")"
      if (( samples > RUNNER_QUIET_SAMPLES )); then echo '9.50 8.00 4.00 9/1900 5000'; else echo '0.50 0.80 1.00 1/1900 5000'; fi ;;
    *'shell dumpsys package com.nf404.twinkler') echo 'versionName=1.3.6' ;;
    *'shell pm path com.nf404.twinkler') echo 'package:/data/app/lampada/base.apk' ;;
    *'pull /data/app/lampada/base.apk '*) touch "$5" ;;
    *'shell settings get system system_locales') echo ru-RU ;;
    *'shell pm list packages dev.mobile.maestro'*) printf '%b' "$RUNNER_MAESTRO_PACKAGES" ;;
    *' uninstall dev.mobile.maestro'*) exit "$RUNNER_UNINSTALL_EXIT" ;;
    *'shell pm path dev.mobile.maestro'*) echo "package:/data/app/\${*: -1}/base.apk" ;;
    *'shell sha256sum /data/app/'*)
      entry=maestro-app.apk; [[ "$*" == *maestro.test/* ]] && entry=maestro-server.apk
      hash="$(printf 'apk:%s\n' "$entry" | shasum -a 256 | cut -d' ' -f1)"
      [[ "$RUNNER_DRIVER_MATCH" == 1 ]] || hash="$(printf '0%.0s' {1..64})"
      echo "$hash  \${*: -1}" ;;
    *) echo 'Unexpected device operation' >&2; exit 90 ;;
  esac`);
  mock('apkanalyzer', 'cat "$RUNNER_MANIFEST"');
  mock('npm', 'exit "$RUNNER_ENV_EXIT"');
  mock('node', 'exec "$RUNNER_REAL_NODE" "$@"');
  mock('maestro', `if [[ -n "\${RUNNER_MAESTRO_HANG:-}" ]]; then
    sleep 30 &
    trap 'kill $!; echo maestro-terminated >> "$RUNNER_EVENTS"; exit 0' TERM
    wait
  fi
  exit "$RUNNER_MAESTRO_EXIT"`);
  mock('unzip', '[[ "$1 $2" == "-p ' + join(root, 'lib/maestro-client.jar') + '" ]]; printf "apk:%s\\n" "$3"');
  const output = join(root, 'output');
  const options = (extra) => ({
    encoding: 'utf8',
    env: { ...process.env, PATH: join(root, 'bin') + ':' + process.env.PATH,
      ANDROID_TEST_DEVICE: 'mock-device', ANDROID_TEST_OUTPUT_DIR: output,
      RUNNER_EVENTS: events, RUNNER_MANIFEST: manifest, RUNNER_REAL_NODE: process.execPath,
      RUNNER_ENV_EXIT: String(environmentExit), RUNNER_MAESTRO_EXIT: '0', RUNNER_QUIET_SAMPLES: '1000000',
      ANDROID_QUIET_INTERVAL_SECONDS: '0.01', RUNNER_UPTIME: '600.00',
      RUNNER_MAESTRO_PACKAGES: '', RUNNER_UNINSTALL_EXIT: '0', RUNNER_DRIVER_MATCH: '0', ...extra },
  });
  const read = () => (existsSync(events) ? readFileSync(events, 'utf8') : '');
  return {
    root,
    events: read,
    run(script, flows = [], extra = {}) {
      const result = spawnSync('/bin/bash', [join(root, 'scripts', script), ...flows], options(extra));
      return { ...result, output, events: read() };
    },
    start(script, flows = [], extra = {}) {
      return spawn('/bin/bash', [join(root, 'scripts', script), ...flows], options(extra));
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
  assert.match(result.stderr, /guest-load boot ready uptime=600s load=0\.5 /);
  assert.match(readFileSync(join(result.output, 'android-ans-024-recordings-keyboard.log'), 'utf8'),
    /^guest-load android-ans-024-recordings-keyboard start load=0\.5 waited=0s\n(.|\n)*^guest-load android-ans-024-recordings-keyboard end load=0\.5 exit=0$/m);
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

test('a busy guest fails the next flow loudly instead of starting it', (t) => {
  // Загрузка после ворот загрузки (1 замер) и первого сценария (3 до + 1 после) — высокая.
  const result = harness(t).run('test-android.sh', ['android-smoke-full', 'android-smoke-full-relaunch'],
    { RUNNER_QUIET_SAMPLES: '5', ANDROID_QUIET_TIMEOUT_SECONDS: '0.05' });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.equal((result.events.match(/^maestro /gm) ?? []).length, 1);
  assert.equal(readFileSync(join(result.output, 'android-smoke-full-relaunch.exit'), 'utf8'), '1\n');
  assert.match(readFileSync(join(result.output, 'android-smoke-full-relaunch.log'), 'utf8'),
    /android-smoke-full-relaunch was not started: Guest 1-min load did not stay below 3 .*last samples: (9\.5, )+9\.5/);
});

test('a freshly booted guest is not tested before its settle window', (t) => {
  const result = harness(t).run('test-android.sh', ['android-ans-024-recordings-keyboard'],
    { RUNNER_UPTIME: '0.01', ANDROID_BOOT_SETTLE_SECONDS: '0.05', ANDROID_BOOT_TIMEOUT_SECONDS: '0.05' });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /Emulator did not reach: uptime of 0.05 s/);
  assert.doesNotMatch(result.events, /^maestro |validate-installed-android|cat \/proc\/loadavg/m);
});

const bothDrivers = 'package:dev.mobile.maestro\\npackage:dev.mobile.maestro.test\\n';

test('a driver that differs from the current Maestro is removed once before the first flow', (t) => {
  const result = harness(t).run('test-android.sh', ['android-smoke-full', 'android-smoke-full-relaunch'],
    { RUNNER_MAESTRO_PACKAGES: bothDrivers });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const lines = result.events.split('\n');
  const uninstalls = lines.filter((line) => / uninstall /.test(line));
  assert.deepEqual(uninstalls, ['adb -s mock-device uninstall dev.mobile.maestro',
    'adb -s mock-device uninstall dev.mobile.maestro.test']);
  const flows = lines.filter((line) => line.startsWith('maestro '));
  assert.equal(flows.length, 2);
  for (const line of flows) assert.match(line, /^maestro --device mock-device test --no-reinstall-driver /);
  assert.ok(lines.indexOf(uninstalls[1]) < lines.indexOf(flows[0]));
});

test('a driver identical to the current Maestro APKs is kept for every run', (t) => {
  const result = harness(t).run('test-android.sh', ['android-ans-024-recordings-keyboard'],
    { RUNNER_MAESTRO_PACKAGES: bothDrivers, RUNNER_DRIVER_MATCH: '1' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.events, /sha256sum \/data\/app\/dev\.mobile\.maestro\.test\/base\.apk/);
  assert.doesNotMatch(result.events, / uninstall /);
  assert.match(result.stdout, /maestro-driver dev\.mobile\.maestro\.test matches the current Maestro; reused/);
});

test('a missing driver is left for the first flow to install', (t) => {
  const result = harness(t).run('test-android.sh', ['android-ans-024-recordings-keyboard']);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.doesNotMatch(result.events, / uninstall |sha256sum/);
});

test('a driver that cannot be checked or removed stops the run before any flow', (t) => {
  const cases = [
    { extra: { RUNNER_UNINSTALL_EXIT: '1' } },
    { extra: { RUNNER_DRIVER_MATCH: '1' }, prepare: (h) => rmSync(join(h.root, 'lib/maestro-client.jar')) },
  ];
  for (const { extra, prepare } of cases) {
    const h = harness(t);
    prepare?.(h);
    const result = h.run('test-android.sh', ['android-ans-024-recordings-keyboard'],
      { RUNNER_MAESTRO_PACKAGES: 'package:dev.mobile.maestro\\n', ...extra });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.doesNotMatch(result.events, /^maestro /m);
  }
});

test('stopping the runner stops the running flow and starts no further flows', async (t) => {
  const h = harness(t);
  const runner = h.start('test-android.sh', ['android-smoke-full', 'android-smoke-full-relaunch'],
    { RUNNER_MAESTRO_HANG: '1' });
  let stderr = '';
  runner.stderr.on('data', (chunk) => { stderr += chunk; });
  const exited = new Promise((done) => runner.on('exit', (code) => done(code)));
  const deadline = Date.now() + 20_000;
  while (!/^maestro /m.test(h.events())) {
    assert.ok(Date.now() < deadline, 'Maestro was not started');
    await new Promise((done) => setTimeout(done, 50));
  }
  await new Promise((done) => setTimeout(done, 200));
  runner.kill('SIGTERM');
  assert.equal(await exited, 143, stderr);
  assert.match(h.events(), /^maestro-terminated$/m);
  assert.equal((h.events().match(/^maestro /gm) ?? []).length, 1);
  assert.match(stderr, /Stopped by a signal during android-smoke-full;/);
});

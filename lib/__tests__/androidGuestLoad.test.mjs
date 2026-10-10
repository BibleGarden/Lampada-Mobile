import assert from 'node:assert/strict';
import test from 'node:test';
import { execute, parseLoadAverage, parseUptime, readSettings, runFlowOnQuietGuest, waitForQuietGuest }
  from '../../scripts/android-guest-load.mjs';

function guest(loads) {
  let clock = 0;
  const pending = [...loads];
  return {
    sample: async () => {
      assert.ok(pending.length > 0, 'the gate sampled more often than expected');
      return pending.shift();
    },
    now: () => clock,
    wait: async (ms) => { clock += ms; },
    remaining: () => pending.length,
  };
}

const gate = (fake, overrides = {}) => waitForQuietGuest({ sample: fake.sample, now: fake.now, wait: fake.wait,
  threshold: 3, samples: 3, intervalMs: 5000, timeoutMs: 60_000, ...overrides });

test('guest load is the first field of /proc/loadavg', () => {
  assert.equal(parseLoadAverage('13.28 11.42 8.76 1/1948 5443\n'), 13.28);
  assert.equal(parseLoadAverage('0.36 1.02 2.5 2/1200 77'), 0.36);
  for (const text of ['', 'busy', '1.0 2.0 3.0', '1,5 2.0 3.0 1/2 3', '1.0 2.0 3.0 1/2 3 extra']) {
    assert.throws(() => parseLoadAverage(text), /Unexpected \/proc\/loadavg/);
  }
});

test('guest uptime is the first field of /proc/uptime', () => {
  assert.equal(parseUptime('1475.21 5512.80\n'), 1475.21);
  for (const text of ['', '12', 'up 24 min', '1.0 2.0 3.0']) {
    assert.throws(() => parseUptime(text), /Unexpected \/proc\/uptime/);
  }
});

test('a quiet guest passes after the required consecutive samples', async () => {
  const fake = guest([1.2, 0.9, 2.99]);
  assert.deepEqual(await gate(fake), { load: 2.99, waitedMs: 10_000 });
  assert.equal(fake.remaining(), 0);
});

test('a spike resets the quiet streak and the threshold itself is not quiet', async () => {
  const fake = guest([1, 1, 3, 1, 1, 1]);
  assert.deepEqual(await gate(fake), { load: 1, waitedMs: 25_000 });
});

test('a guest that stays busy fails at the timeout with the measured load', async () => {
  const fake = guest([12, 8, 2, 7.5, 6.25]);
  await assert.rejects(gate(fake, { timeoutMs: 20_000 }),
    /did not stay below 3 for 3 samples in a row within 20 s; last samples: 12, 8, 2, 7.5, 6.25\./);
  assert.equal(fake.remaining(), 0);
});

test('a failing load probe fails the gate instead of passing it', async () => {
  await assert.rejects(waitForQuietGuest({ sample: async () => { throw new Error('adb: device offline'); },
    threshold: 3, samples: 1, intervalMs: 5000, timeoutMs: 60_000 }), /device offline/);
});

test('settings use documented defaults and reject invalid overrides', () => {
  assert.deepEqual(readSettings({}), { threshold: 3, intervalSeconds: 5, flowSamples: 3, flowTimeoutSeconds: 300,
    bootSettleSeconds: 120, bootTimeoutSeconds: 900 });
  assert.equal(readSettings({ ANDROID_QUIET_TIMEOUT_SECONDS: '10' }).flowTimeoutSeconds, 10);
  assert.equal(readSettings({ ANDROID_QUIET_LOAD: '4.5' }).threshold, 4.5);
  assert.equal(readSettings({ ANDROID_QUIET_SAMPLES: '5' }).flowSamples, 5);
  assert.throws(() => readSettings({ ANDROID_QUIET_LOAD: 'high' }), /ANDROID_QUIET_LOAD must be a positive number/);
  assert.throws(() => readSettings({ ANDROID_QUIET_TIMEOUT_SECONDS: '0' }), /positive number/);
  assert.throws(() => readSettings({ ANDROID_QUIET_SAMPLES: '2.5' }), /ANDROID_QUIET_SAMPLES must be a positive integer/);
});

test('settings that can never pass on an idle guest are rejected', () => {
  assert.throws(() => readSettings({ ANDROID_QUIET_TIMEOUT_SECONDS: '9' }),
    /ANDROID_QUIET_TIMEOUT_SECONDS \(9\) is shorter than ANDROID_QUIET_SAMPLES samples .* \(10 s\)/);
  assert.throws(() => readSettings({ ANDROID_QUIET_SAMPLES: '62' }), /is shorter than ANDROID_QUIET_SAMPLES/);
  assert.throws(() => readSettings({ ANDROID_BOOT_TIMEOUT_SECONDS: '100' }),
    /ANDROID_BOOT_TIMEOUT_SECONDS \(100\) is shorter than ANDROID_BOOT_SETTLE_SECONDS \(120\)/);
});

function flowRun(loads, exit) {
  const reported = [];
  const pending = [...loads];
  const settings = { ...readSettings({}), intervalSeconds: 0.001 };
  return { reported, promise: runFlowOnQuietGuest({ flow: 'flow-a', settings, report: (line) => reported.push(line),
    launch: async () => exit,
    sample: async () => {
      const next = pending.shift();
      if (next instanceof Error) throw next;
      return next;
    } }) };
}

test('a flow reports its start and end load and keeps its exit code', async () => {
  const run = flowRun([1, 1, 1, 2.5], 4);
  assert.equal(await run.promise, 4);
  assert.match(run.reported[0], /^guest-load flow-a start load=1 waited=0s$/);
  assert.deepEqual(run.reported.slice(1), ['guest-load flow-a end load=2.5 exit=4']);
});

test('a failed load probe after the flow is reported without hiding the flow result', async () => {
  const lost = new Error('adb: device offline');
  const failed = flowRun([1, 1, 1, lost], 5);
  assert.equal(await failed.promise, 5);
  assert.equal(failed.reported[1], 'guest-load flow-a end load probe failed: adb: device offline; flow exit=5');
  const passed = flowRun([1, 1, 1, lost], 0);
  assert.equal(await passed.promise, 1);
  assert.match(passed.reported[1], /end load probe failed: .*; flow exit=0$/);
});

test('stop signals reach the flow command and the handlers are released', async () => {
  const before = process.listenerCount('SIGTERM');
  const child = execute([process.execPath, '-e',
    "process.on('SIGTERM', () => process.exit(3)); setInterval(() => {}, 1000); console.log('ready')"], 'pipe');
  await new Promise((done) => setTimeout(done, 300));
  assert.equal(process.listenerCount('SIGTERM'), before + 1);
  process.emit('SIGTERM', 'SIGTERM');
  assert.equal(await child, 3);
  assert.equal(process.listenerCount('SIGTERM'), before);
});

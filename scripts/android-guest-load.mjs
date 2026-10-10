// Ворота готовности эмулятора: Maestro-сценарий стартует только на тихом госте.
// Голодание CPU гостя (фоновые задачи Play Services, установка драйвера Maestro,
// нагрузка на хосте) ломает сценарии таймаутами, похожими на ошибки приложения.
import { execFile, spawn } from 'node:child_process';
import { appendFileSync, openSync, closeSync } from 'node:fs';
import { constants } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const SETTINGS = {
  threshold: ['ANDROID_QUIET_LOAD', 3],
  intervalSeconds: ['ANDROID_QUIET_INTERVAL_SECONDS', 5],
  flowSamples: ['ANDROID_QUIET_SAMPLES', 3],
  flowTimeoutSeconds: ['ANDROID_QUIET_TIMEOUT_SECONDS', 300],
  bootSettleSeconds: ['ANDROID_BOOT_SETTLE_SECONDS', 120],
  bootTimeoutSeconds: ['ANDROID_BOOT_QUIET_TIMEOUT_SECONDS', 900],
};

export function readSettings(environment) {
  return Object.fromEntries(Object.entries(SETTINGS).map(([key, [name, fallback]]) => {
    const raw = environment[name];
    if (raw === undefined || raw === '') return [key, fallback];
    const value = Number(raw);
    const integer = key === 'flowSamples';
    if (!Number.isFinite(value) || value <= 0 || (integer && !Number.isInteger(value))) {
      throw new Error(`${name} must be a positive ${integer ? 'integer' : 'number'}, got ${JSON.stringify(raw)}`);
    }
    return [key, value];
  }));
}

export function parseLoadAverage(text) {
  const match = /^\s*(\d+(?:\.\d+)?)\s+\d+(?:\.\d+)?\s+\d+(?:\.\d+)?\s+\d+\/\d+\s+\d+\s*$/.exec(text);
  if (!match) throw new Error(`Unexpected /proc/loadavg content: ${JSON.stringify(text)}`);
  return Number(match[1]);
}

export function parseUptime(text) {
  const match = /^\s*(\d+(?:\.\d+)?)\s+\d+(?:\.\d+)?\s*$/.exec(text);
  if (!match) throw new Error(`Unexpected /proc/uptime content: ${JSON.stringify(text)}`);
  return Number(match[1]);
}

// Ждёт, пока 1-минутная загрузка гостя будет ниже порога в `samples` замерах
// подряд. По таймауту бросает ошибку с последними замерами: сценарий не
// запускается, «тихий» пропуск запрещён.
export async function waitForQuietGuest({ sample, threshold, samples, intervalMs, timeoutMs,
  now = Date.now, wait = sleep }) {
  const started = now();
  const history = [];
  let quiet = 0;
  for (;;) {
    const load = await sample();
    history.push(load);
    quiet = load < threshold ? quiet + 1 : 0;
    const waitedMs = now() - started;
    if (quiet >= samples) return { load, waitedMs };
    if (waitedMs + intervalMs > timeoutMs) {
      throw new Error(`Guest 1-min load did not stay below ${threshold} for ${samples} samples in a row `
        + `within ${Math.round(waitedMs / 1000)} s; last samples: ${history.slice(-samples * 2).join(', ')}. `
        + 'Find the busy process with `adb shell top` and host `top` before testing.');
    }
    await wait(intervalMs);
  }
}

async function shell(device, ...command) {
  const { stdout } = await run('adb', ['-s', device, 'shell', ...command], { timeout: 30_000 });
  return stdout.replace(/\r/g, '').trim();
}

const guestLoad = (device) => async () => parseLoadAverage(await shell(device, 'cat', '/proc/loadavg'));

async function waitUntil(description, check, deadline, intervalMs) {
  for (;;) {
    if (await check()) return;
    if (Date.now() + intervalMs > deadline) throw new Error(`Emulator did not reach: ${description}`);
    await sleep(intervalMs);
  }
}

// Разовая проверка после загрузки: система загружена, менеджер пакетов
// отвечает, прошло окно фоновых задач холодного старта и гость утих.
// На давно загруженном эмуляторе она стоит столько же, сколько гейт сценария.
export async function waitForBootedQuietGuest(device, settings, report) {
  const intervalMs = settings.intervalSeconds * 1000;
  const started = Date.now();
  const deadline = started + settings.bootTimeoutSeconds * 1000;
  await waitUntil('sys.boot_completed=1', async () => (await shell(device, 'getprop', 'sys.boot_completed')) === '1',
    deadline, intervalMs);
  await waitUntil('package manager ready', async () => {
    try {
      return (await shell(device, 'pm', 'path', 'android')).startsWith('package:');
    } catch {
      // До готовности сервиса package команда pm завершается с ошибкой.
      return false;
    }
  }, deadline, intervalMs);
  const uptime = async () => parseUptime(await shell(device, 'cat', '/proc/uptime'));
  await waitUntil(`uptime of ${settings.bootSettleSeconds} s`, async () => (await uptime()) >= settings.bootSettleSeconds,
    deadline, intervalMs);
  const { load } = await waitForQuietGuest({ sample: guestLoad(device), threshold: settings.threshold,
    samples: settings.flowSamples, intervalMs, timeoutMs: Math.max(0, deadline - Date.now()) });
  report(`guest-load boot ready uptime=${Math.round(await uptime())}s load=${load} `
    + `waited=${Math.round((Date.now() - started) / 1000)}s`);
}

// Гейт перед сценарием, сам сценарий и замер после него. Код выхода — код сценария.
export async function runFlowOnQuietGuest(device, flow, command, flowLog, settings, report) {
  const { load, waitedMs } = await waitForQuietGuest({ sample: guestLoad(device), threshold: settings.threshold,
    samples: settings.flowSamples, intervalMs: settings.intervalSeconds * 1000,
    timeoutMs: settings.flowTimeoutSeconds * 1000 }).catch((error) => {
    throw new Error(`${flow} was not started: ${error.message}`);
  });
  report(`guest-load ${flow} start load=${load} waited=${Math.round(waitedMs / 1000)}s`);
  const output = flowLog ? openSync(flowLog, 'a') : 'inherit';
  const exit = await new Promise((done, fail) => {
    const child = spawn(command[0], command.slice(1), { stdio: ['ignore', output, output] });
    child.on('error', fail);
    child.on('exit', (code, signal) => done(code ?? 128 + constants.signals[signal]));
  }).finally(() => { if (flowLog) closeSync(output); });
  report(`guest-load ${flow} end load=${await guestLoad(device)()} exit=${exit}`);
  return exit;
}

function parseArguments(argv) {
  const [mode, ...rest] = argv;
  const separator = rest.indexOf('--');
  const options = separator < 0 ? rest : rest.slice(0, separator);
  const command = separator < 0 ? [] : rest.slice(separator + 1);
  const values = {};
  for (let index = 0; index < options.length; index += 2) {
    const name = options[index];
    if (!['--device', '--flow', '--flow-log'].includes(name) || options[index + 1] === undefined) {
      throw new Error(`Unknown or incomplete option: ${name}`);
    }
    values[name.slice(2)] = options[index + 1];
  }
  if (!values.device) throw new Error('--device is required');
  if (mode === 'boot' && !values.flow && !values['flow-log'] && command.length === 0) return { mode, ...values };
  if (mode === 'run' && values.flow && command.length > 0) return { mode, command, ...values };
  throw new Error('Usage: android-guest-load.mjs boot --device <serial>\n'
    + '       android-guest-load.mjs run --device <serial> --flow <name> [--flow-log <file>] -- <command...>');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let flowLog;
  const report = (line) => {
    console.error(line);
    if (flowLog) appendFileSync(flowLog, line + '\n');
  };
  try {
    const options = parseArguments(process.argv.slice(2));
    flowLog = options['flow-log'];
    const settings = readSettings(process.env);
    if (options.mode === 'boot') {
      await waitForBootedQuietGuest(options.device, settings, report);
    } else {
      process.exitCode = await runFlowOnQuietGuest(options.device, options.flow, options.command,
        options['flow-log'], settings, report);
    }
  } catch (error) {
    report(error.message);
    process.exitCode = 1;
  }
}

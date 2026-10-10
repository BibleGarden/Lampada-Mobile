// Ворота готовности эмулятора: Maestro-сценарий стартует только на тихом госте.
// Голодание CPU гостя (фоновые задачи Play Services, установка драйвера Maestro,
// нагрузка на хосте) ломает сценарии таймаутами, похожими на ошибки приложения.
import { execFile, spawn } from 'node:child_process';
import { appendFileSync, openSync, closeSync } from 'node:fs';
import { constants } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const SETTINGS = {
  threshold: ['ANDROID_QUIET_LOAD', 3],
  intervalSeconds: ['ANDROID_QUIET_INTERVAL_SECONDS', 5],
  flowSamples: ['ANDROID_QUIET_SAMPLES', 3],
  flowTimeoutSeconds: ['ANDROID_QUIET_TIMEOUT_SECONDS', 300],
  bootSettleSeconds: ['ANDROID_BOOT_SETTLE_SECONDS', 120],
  bootTimeoutSeconds: ['ANDROID_BOOT_TIMEOUT_SECONDS', 900],
};
const name = (key) => SETTINGS[key][0];

export function readSettings(environment) {
  const settings = Object.fromEntries(Object.entries(SETTINGS).map(([key, [variable, fallback]]) => {
    const raw = environment[variable];
    if (raw === undefined || raw === '') return [key, fallback];
    const value = Number(raw);
    const integer = key === 'flowSamples';
    if (!Number.isFinite(value) || value <= 0 || (integer && !Number.isInteger(value))) {
      throw new Error(`${variable} must be a positive ${integer ? 'integer' : 'number'}, got ${JSON.stringify(raw)}`);
    }
    return [key, value];
  }));
  // Сочетания, при которых гейт не может пройти даже на простаивающем госте.
  const quietWindow = (settings.flowSamples - 1) * settings.intervalSeconds;
  if (settings.flowTimeoutSeconds < quietWindow) {
    throw new Error(`${name('flowTimeoutSeconds')} (${settings.flowTimeoutSeconds}) is shorter than `
      + `${name('flowSamples')} samples ${name('intervalSeconds')} apart (${quietWindow} s)`);
  }
  if (settings.bootTimeoutSeconds < settings.bootSettleSeconds) {
    throw new Error(`${name('bootTimeoutSeconds')} (${settings.bootTimeoutSeconds}) is shorter than `
      + `${name('bootSettleSeconds')} (${settings.bootSettleSeconds})`);
  }
  return settings;
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
  const { stdout } = await execFileAsync('adb', ['-s', device, 'shell', ...command], { timeout: 30_000 });
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

// Разовая проверка после загрузки: система загружена (sys.boot_completed
// выставляется после запуска менеджера пакетов) и прошло окно фоновых задач
// холодного старта. Тишину гостя проверяет гейт каждого сценария.
export async function waitForBootedGuest(device, settings, report) {
  const intervalMs = settings.intervalSeconds * 1000;
  const started = Date.now();
  const deadline = started + settings.bootTimeoutSeconds * 1000;
  await waitUntil('sys.boot_completed=1', async () => (await shell(device, 'getprop', 'sys.boot_completed')) === '1',
    deadline, intervalMs);
  const uptime = async () => parseUptime(await shell(device, 'cat', '/proc/uptime'));
  await waitUntil(`uptime of ${settings.bootSettleSeconds} s`, async () => (await uptime()) >= settings.bootSettleSeconds,
    deadline, intervalMs);
  report(`guest-load boot ready uptime=${Math.round(await uptime())}s load=${await guestLoad(device)()} `
    + `waited=${Math.round((Date.now() - started) / 1000)}s`);
}

// Запускает команду; сигналы остановки передаются ей, чтобы Maestro не
// продолжал управлять эмулятором после остановки прогона.
export function execute(command, output) {
  return new Promise((done, fail) => {
    const child = spawn(command[0], command.slice(1), { stdio: ['ignore', output, output] });
    const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'];
    const forward = (signal) => child.kill(signal);
    for (const signal of signals) process.on(signal, forward);
    const release = () => { for (const signal of signals) process.off(signal, forward); };
    child.on('error', (error) => { release(); fail(error); });
    child.on('exit', (code, signal) => { release(); done(code ?? 128 + constants.signals[signal]); });
  });
}

// Гейт перед сценарием, сам сценарий и замер после него. Код выхода — код
// сценария; если замер после него не удался, об этом сообщается отдельно,
// а успешный сценарий получает код 1.
export async function runFlowOnQuietGuest({ flow, sample, launch, settings, report }) {
  const { load, waitedMs } = await waitForQuietGuest({ sample, threshold: settings.threshold,
    samples: settings.flowSamples, intervalMs: settings.intervalSeconds * 1000,
    timeoutMs: settings.flowTimeoutSeconds * 1000 }).catch((error) => {
    throw new Error(`${flow} was not started: ${error.message}`);
  });
  report(`guest-load ${flow} start load=${load} waited=${Math.round(waitedMs / 1000)}s`);
  const exit = await launch();
  let end;
  try {
    end = await sample();
  } catch (error) {
    report(`guest-load ${flow} end load probe failed: ${error.message}; flow exit=${exit}`);
    return exit || 1;
  }
  report(`guest-load ${flow} end load=${end} exit=${exit}`);
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
      await waitForBootedGuest(options.device, settings, report);
    } else {
      process.exitCode = await runFlowOnQuietGuest({ flow: options.flow, sample: guestLoad(options.device), settings,
        report, launch: async () => {
          const output = flowLog ? openSync(flowLog, 'a') : 'inherit';
          try {
            return await execute(options.command, output);
          } finally {
            if (flowLog) closeSync(output);
          }
        } });
    }
  } catch (error) {
    report(error.message);
    process.exitCode = 1;
  }
}

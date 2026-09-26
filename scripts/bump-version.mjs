import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// release — сборка для стора: следующая минорная версия без патча (1.1.3 -> 1.2);
// test — локальная или внутренняя сборка: следующий патч текущего релиза (1.2 -> 1.2.1).
const mode = process.argv[2];
if (mode !== 'release' && mode !== 'test') throw new Error('Usage: bump-version.mjs release | test');

const configPath = fileURLToPath(new URL('../app.json', import.meta.url));
const config = JSON.parse(readFileSync(configPath, 'utf8'));
const current = config.expo.version;
if (typeof current !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\.(0|[1-9]\d*))?$/.test(current)) {
  throw new Error('expo.version must be major.minor or major.minor.patch');
}
const [major, minor, patch = '0'] = current.split('.');
const next = mode === 'release' ? [major, Number(minor) + 1] : [major, minor, Number(patch) + 1];
if (!next.every((part) => Number.isSafeInteger(Number(part)))) {
  throw new Error('expo.version component exceeds the safe integer range');
}
config.expo.version = next.join('.');
const temporaryPath = `${configPath}.${process.pid}.tmp`;
writeFileSync(temporaryPath, `${JSON.stringify(config, null, 2)}\n`);
renameSync(temporaryPath, configPath);
console.log(`App version: ${current} -> ${config.expo.version}`);

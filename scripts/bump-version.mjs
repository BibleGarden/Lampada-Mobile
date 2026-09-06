import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const configPath = fileURLToPath(new URL('../app.json', import.meta.url));
const config = JSON.parse(readFileSync(configPath, 'utf8'));
const current = config.expo.version;
if (typeof current !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\.(0|[1-9]\d*))?$/.test(current)) {
  throw new Error('expo.version must be major.minor or major.minor.patch');
}
const [major, minor, patch = '0'] = current.split('.');
const nextPatch = Number(patch) + 1;
if (!Number.isSafeInteger(nextPatch)) throw new Error('expo.version patch exceeds the safe integer range');
config.expo.version = `${major}.${minor}.${nextPatch}`;
const temporaryPath = `${configPath}.${process.pid}.tmp`;
writeFileSync(temporaryPath, `${JSON.stringify(config, null, 2)}\n`);
renameSync(temporaryPath, configPath);
console.log(`App version: ${current} -> ${config.expo.version}`);

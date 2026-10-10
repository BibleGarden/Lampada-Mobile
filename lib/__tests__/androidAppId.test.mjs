import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

// ADR-0040: Android переименован до первой публикации в Google Play, iOS-приложение
// уже опубликовано в App Store и сохраняет свой bundle identifier.
const androidId = 'app.lampada';
const iosBundleId = 'twinkler';
const retiredAndroidId = 'com.nf404.twinkler';
const repo = fileURLToPath(new URL('../../', import.meta.url));

function files(path) {
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path).flatMap((name) => files(join(path, name)));
}

test('app config keeps the Android and iOS application ids apart', () => {
  const { expo } = JSON.parse(readFileSync(join(repo, 'app.json'), 'utf8'));
  assert.equal(expo.android.package, androidId);
  assert.equal(expo.ios.bundleIdentifier, iosBundleId);
});

test('Android flows and scripts do not target the retired Android id', () => {
  const scripts = readdirSync(join(repo, 'scripts')).filter((name) => name.includes('android'));
  const targets = [
    join(repo, 'testing/android-e2e'),
    join(repo, 'plugins/withAndroidBuild.js'),
    ...scripts.map((name) => join(repo, 'scripts', name)),
  ].flatMap(files);
  assert.ok(targets.some((path) => path.endsWith('.yaml')), 'Android flows are missing');
  const stale = targets.filter((path) => readFileSync(path, 'utf8').includes(retiredAndroidId));
  assert.deepEqual(stale.map((path) => path.slice(repo.length)), []);
});

test('Android flows launch the Android application id', () => {
  const directory = join(repo, 'testing/android-e2e');
  for (const name of readdirSync(directory).filter((file) => file.endsWith('.yaml'))) {
    const appId = readFileSync(join(directory, name), 'utf8').match(/^appId: (.+)$/m)?.[1];
    assert.equal(appId, androidId, name);
  }
});

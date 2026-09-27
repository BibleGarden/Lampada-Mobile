import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldPauseReflectionFlame } from '../reflectionFlame.ts';

test('ordinary builds never freeze the reflection flame', () => {
  for (const flag of [undefined, '', '0']) {
    assert.equal(shouldPauseReflectionFlame(flag, false), false);
    assert.equal(shouldPauseReflectionFlame(flag, true), false);
  }
});

test('video builds freeze the reflection flame only while input is focused', () => {
  assert.equal(shouldPauseReflectionFlame('1', false), false);
  assert.equal(shouldPauseReflectionFlame('1', true), true);
  assert.equal(shouldPauseReflectionFlame('1', false), false);
});

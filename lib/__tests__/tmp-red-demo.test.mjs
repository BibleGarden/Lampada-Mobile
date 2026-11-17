import { test } from 'node:test';
import assert from 'node:assert/strict';

test('temporary red/green demonstration: this check intentionally fails', () => {
  assert.equal(1, 2);
});

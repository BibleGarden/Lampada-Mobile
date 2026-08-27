import assert from 'node:assert/strict';
import test from 'node:test';

import { mergeOfflineTrail, shouldDeferLoadedNext } from '../scriptureSessionState.ts';

const item = (canonicalId) => ({ canonicalId });

test('a completed Next is deferred when the user navigated back while waiting', () => {
  assert.equal(shouldDeferLoadedNext(1, 0), true);
  assert.equal(shouldDeferLoadedNext(1, 1), false);
});

test('offline fallback preserves the current trail and appends older cached snapshots', () => {
  const merged = mergeOfflineTrail(
    [item('A'), item('B')],
    [item('B'), item('A'), item('older')],
    1,
  );
  assert.deepEqual(merged.map((value) => value.canonicalId), ['A', 'B', 'older']);
  assert.equal(merged[0].offline, undefined);
  assert.equal(merged[1].offline, true);
});

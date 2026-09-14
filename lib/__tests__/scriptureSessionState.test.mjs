import assert from 'node:assert/strict';
import test from 'node:test';

import {
  OFFLINE_SCRIPTURE_TRAIL_LIMIT,
  mergeOfflineTrail,
  shouldDeferLoadedNext,
} from '../scriptureSessionState.ts';

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

test('offline fallback exposes only the latest seven saved passages', () => {
  const cached = Array.from({ length: 12 }, (_, index) => item(`cached-${index}`));
  const merged = mergeOfflineTrail([], cached, 0);

  assert.equal(merged.length, OFFLINE_SCRIPTURE_TRAIL_LIMIT);
  assert.deepEqual(
    merged.map((value) => value.canonicalId),
    cached.slice(0, OFFLINE_SCRIPTURE_TRAIL_LIMIT).map((value) => value.canonicalId),
  );
});

test('existing session passages count toward the offline trail limit', () => {
  const current = [item('current-a'), item('current-b')];
  const cached = Array.from({ length: 12 }, (_, index) => item(`cached-${index}`));
  const merged = mergeOfflineTrail(current, cached, 1);

  assert.equal(merged.length, OFFLINE_SCRIPTURE_TRAIL_LIMIT);
  assert.equal(merged[1].offline, true);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionCompletion } from '../sessionCompletion.ts';

function fixture(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let finishes = 0;
  const completion = createSessionCompletion(() => { finishes += 1; });
  t.after(completion.cancel);
  return {
    ...completion,
    update: (changes = {}) => completion.update({
      remaining: 0, answerOpen: false, scripturePhase: 'idle', ...changes,
    }),
    finishes: () => finishes,
  };
}

test('timer expiry waits for the passage, then gives three full seconds before one finish', (t) => {
  const session = fixture(t);
  session.update({ scripturePhase: 'playing' });
  t.mock.timers.tick(60_000);
  assert.equal(session.finishes(), 0);

  session.update();
  t.mock.timers.tick(2_999);
  assert.equal(session.finishes(), 0);
  session.update();
  t.mock.timers.tick(1);
  assert.equal(session.finishes(), 1);
  session.update();
  t.mock.timers.tick(10_000);
  assert.equal(session.finishes(), 1);
});

test('loading, pause and resume preserve listening after the deadline', (t) => {
  const session = fixture(t);
  for (const scripturePhase of ['loading', 'playing', 'paused', 'loading', 'playing']) {
    session.update({ scripturePhase });
    t.mock.timers.tick(10_000);
    assert.equal(session.finishes(), 0, scripturePhase);
  }
  session.update();
  t.mock.timers.tick(3_000);
  assert.equal(session.finishes(), 1);
});

test('starting audio during the ordinary transition window cancels that transition', (t) => {
  const session = fixture(t);
  session.update();
  t.mock.timers.tick(399);
  session.update({ scripturePhase: 'loading' });
  t.mock.timers.tick(10_000);
  assert.equal(session.finishes(), 0);
  session.update({ scripturePhase: 'playing' });
  session.update();
  t.mock.timers.tick(3_000);
  assert.equal(session.finishes(), 1);
});

test('an open answer retains its draft and restarts the quiet interval on close', (t) => {
  const session = fixture(t);
  session.update({ scripturePhase: 'playing' });
  session.update();
  t.mock.timers.tick(2_900);
  session.update({ answerOpen: true });
  t.mock.timers.tick(10_000);
  assert.equal(session.finishes(), 0);
  session.update();
  t.mock.timers.tick(2_999);
  assert.equal(session.finishes(), 0);
  t.mock.timers.tick(1);
  assert.equal(session.finishes(), 1);
});

test('adding time cancels the quiet interval and resets completion for the next deadline', (t) => {
  const session = fixture(t);
  session.update({ scripturePhase: 'playing' });
  session.update();
  t.mock.timers.tick(2_000);
  session.update({ remaining: 60 });
  t.mock.timers.tick(60_000);
  assert.equal(session.finishes(), 0);
  session.update();
  t.mock.timers.tick(400);
  assert.equal(session.finishes(), 1);
});

test('replaying during the quiet interval waits for the new playback to end', (t) => {
  const session = fixture(t);
  session.update({ scripturePhase: 'playing' });
  session.update();
  t.mock.timers.tick(2_900);
  session.update({ scripturePhase: 'loading' });
  session.update({ scripturePhase: 'playing' });
  t.mock.timers.tick(10_000);
  assert.equal(session.finishes(), 0);
  session.update();
  t.mock.timers.tick(3_000);
  assert.equal(session.finishes(), 1);
});

for (const quiet of [false, true]) {
  test(`manual finish during ${quiet ? 'silence' : 'playback'} cancels a second transition`, (t) => {
    const session = fixture(t);
    session.update({ scripturePhase: 'playing' });
    if (quiet) session.update();
    session.finish();
    session.finish();
    session.update();
    t.mock.timers.tick(10_000);
    assert.equal(session.finishes(), 1);
  });
}

test('a playback error stays visible for retry or manual completion', (t) => {
  const session = fixture(t);
  session.update({ scripturePhase: 'loading' });
  session.update({ scripturePhase: 'error' });
  t.mock.timers.tick(60_000);
  assert.equal(session.finishes(), 0);
  session.finish();
  assert.equal(session.finishes(), 1);
});

test('ordinary timer expiry still waits for an open answer and completes once', (t) => {
  const session = fixture(t);
  session.update();
  t.mock.timers.tick(399);
  session.update({ answerOpen: true });
  t.mock.timers.tick(10_000);
  assert.equal(session.finishes(), 0);
  session.update();
  t.mock.timers.tick(400);
  assert.equal(session.finishes(), 1);
});

test('active and untimed prayers do not complete automatically', (t) => {
  const session = fixture(t);
  for (const remaining of [60, null]) {
    session.update({ remaining });
    t.mock.timers.tick(60_000);
    assert.equal(session.finishes(), 0);
  }
});

test('unmount cancels pending navigation and effect setup can safely run again', (t) => {
  const session = fixture(t);
  session.update();
  session.cancel();
  t.mock.timers.tick(10_000);
  assert.equal(session.finishes(), 0);
  session.update();
  t.mock.timers.tick(400);
  assert.equal(session.finishes(), 1);
});

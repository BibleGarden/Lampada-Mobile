import assert from 'node:assert/strict';
import test from 'node:test';
import { scheduleSessionCompletion } from '../sessionCompletion.ts';

function fixture(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const finish = t.mock.fn();
  let cancel = () => {};
  t.after(() => cancel());
  return {
    finish,
    update(changes = {}) {
      cancel();
      cancel = scheduleSessionCompletion({
        timeExpired: true, appActive: true, activityOpen: false, ...changes,
      }, finish);
    },
    cancel: () => cancel(),
    count: () => finish.mock.callCount(),
  };
}

test('reading past expiry is unlimited, then closing the reader starts a one-second delay', (t) => {
  const session = fixture(t);
  session.update({ activityOpen: true });
  t.mock.timers.tick(60_000);
  assert.equal(session.count(), 0);
  session.update();
  t.mock.timers.tick(999);
  assert.equal(session.count(), 0);
  t.mock.timers.tick(1);
  assert.equal(session.count(), 1);
  t.mock.timers.tick(10_000);
  assert.equal(session.count(), 1);
});

test('reopening an activity during the delay cancels navigation and closing starts a fresh second', (t) => {
  const session = fixture(t);
  session.update();
  t.mock.timers.tick(900);
  session.update({ activityOpen: true });
  t.mock.timers.tick(10_000);
  assert.equal(session.count(), 0);
  session.update();
  t.mock.timers.tick(999);
  assert.equal(session.count(), 0);
  t.mock.timers.tick(1);
  assert.equal(session.count(), 1);
});

test('extending the timer cancels completion until the new deadline', (t) => {
  const session = fixture(t);
  session.update();
  t.mock.timers.tick(900);
  session.update({ timeExpired: false });
  t.mock.timers.tick(60_000);
  assert.equal(session.count(), 0);
  session.update();
  t.mock.timers.tick(1_000);
  assert.equal(session.count(), 1);
});

test('backgrounding cancels navigation and foregrounding gives a fresh second', (t) => {
  const session = fixture(t);
  session.update();
  t.mock.timers.tick(900);
  session.update({ appActive: false });
  t.mock.timers.tick(60_000);
  assert.equal(session.count(), 0);
  session.update();
  t.mock.timers.tick(999);
  assert.equal(session.count(), 0);
  t.mock.timers.tick(1);
  assert.equal(session.count(), 1);
});

test('returning from the background with an activity still open keeps waiting', (t) => {
  const session = fixture(t);
  session.update({ appActive: false, activityOpen: true });
  t.mock.timers.tick(60_000);
  session.update({ activityOpen: true });
  t.mock.timers.tick(60_000);
  assert.equal(session.count(), 0);
});

test('leaving the screen cancels pending completion', (t) => {
  const session = fixture(t);
  session.update();
  session.cancel();
  t.mock.timers.tick(60_000);
  assert.equal(session.count(), 0);
});

test('an unexpired or untimed prayer does not schedule completion', (t) => {
  const session = fixture(t);
  session.update({ timeExpired: false });
  t.mock.timers.tick(60_000);
  assert.equal(session.count(), 0);
});

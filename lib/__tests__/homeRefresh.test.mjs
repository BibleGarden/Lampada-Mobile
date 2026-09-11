import assert from 'node:assert/strict';
import test from 'node:test';
import { startHomeRefresh } from '../homeRefresh.ts';
import { getWeekIndicators } from '../streak.ts';

function appState(initialState = 'active') {
  const listeners = new Set();
  return {
    currentState: initialState,
    addEventListener(event, listener) {
      assert.equal(event, 'change');
      listeners.add(listener);
      return { remove: () => listeners.delete(listener) };
    },
    change(state) {
      this.currentState = state;
      for (const listener of listeners) listener(state);
    },
    get listenerCount() { return listeners.size; },
  };
}

test('returning to Home the next day moves yesterday’s prayer out of today', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: new Date(2026, 8, 11, 23) });
  const state = appState();
  const weeks = [];
  const stop = startHomeRefresh(state, () => {
    weeks.push(getWeekIndicators(async () => ['2026-09-11']));
  });
  t.after(stop);

  state.change('background');
  t.mock.timers.tick(2 * 60 * 60 * 1000);
  assert.equal(weeks.length, 1);
  state.change('active');

  assert.deepEqual(await Promise.all(weeks), [
    [false, false, false, false, false, false, true],
    [false, false, false, false, false, true, false],
  ]);
});

test('Home advances at each local midnight without navigation', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: new Date(2026, 8, 11, 23, 59, 58) });
  const state = appState();
  const dates = [];
  const stop = startHomeRefresh(state, () => dates.push(new Date().getDate()));
  t.after(stop);

  t.mock.timers.tick(1999);
  assert.deepEqual(dates, [11]);
  t.mock.timers.tick(1);
  assert.deepEqual(dates, [11, 12]);
  t.mock.timers.tick(24 * 60 * 60 * 1000);
  assert.deepEqual(dates, [11, 12, 13]);
});

test('backgrounding cancels the timer and resuming catches up after several days', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: new Date(2026, 8, 11, 12) });
  const state = appState();
  const dates = [];
  const stop = startHomeRefresh(state, () => dates.push(new Date().getDate()));
  t.after(stop);

  state.change('inactive');
  state.change('background');
  t.mock.timers.tick(3 * 24 * 60 * 60 * 1000);
  assert.deepEqual(dates, [11]);
  state.change('active');
  t.mock.timers.tick(12 * 60 * 60 * 1000);
  assert.deepEqual(dates, [11, 14, 15]);
});

test('leaving Home removes both the app listener and midnight timer', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: new Date(2026, 8, 11, 23) });
  const state = appState();
  let refreshes = 0;
  const stop = startHomeRefresh(state, () => refreshes++);

  stop();
  assert.equal(state.listenerCount, 0);
  state.change('background');
  t.mock.timers.tick(2 * 60 * 60 * 1000);
  state.change('active');
  assert.equal(refreshes, 1);
});

test('Home mounted in the background waits until the app becomes active', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: new Date(2026, 8, 11, 12) });
  const state = appState('background');
  let refreshes = 0;
  const stop = startHomeRefresh(state, () => refreshes++);
  t.after(stop);

  assert.equal(refreshes, 0);
  state.change('active');
  assert.equal(refreshes, 1);
});

for (const [name, month, day, hours] of [['spring', 2, 8, 23], ['autumn', 10, 1, 25]]) {
  test(`local midnight follows the ${hours}-hour ${name} daylight-saving day`, (t) => {
    const previousTimezone = process.env.TZ;
    process.env.TZ = 'America/New_York';
    t.after(() => {
      if (previousTimezone === undefined) delete process.env.TZ;
      else process.env.TZ = previousTimezone;
    });
    t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: new Date(2026, month, day) });
    let refreshes = 0;
    const stop = startHomeRefresh(appState(), () => refreshes++);
    t.after(stop);

    t.mock.timers.tick(hours * 60 * 60 * 1000 - 1);
    assert.equal(refreshes, 1);
    t.mock.timers.tick(1);
    assert.equal(refreshes, 2);
    assert.equal(new Date().getDate(), day + 1);
    assert.equal(new Date().getHours(), 0);
  });
}

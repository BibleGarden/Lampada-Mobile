import assert from 'node:assert/strict';
import test from 'node:test';
import {
  REFLECT_DENSITIES, REFLECT_SPACING, fitReflectDensity,
  reflectionAvailableHeight, reflectionDensityIndex, reflectionQuestionType,
} from '../reflectLayout.ts';

const sc = (value) => value;
const question = 'What should I carry from this prayer?';
const context = JSON.stringify([427, 758, question]);
const measured = (index, lines = 4, overrides = {}) => ({
  availableHeight: 510,
  context,
  index,
  measurement: {
    context, index,
    blockHeight: 28 + lines * reflectionQuestionType(question, REFLECT_DENSITIES[index].fontStep).line,
  },
  actionsHeight: 100,
  keyboardPhase: 'hidden',
  ...overrides,
});

// Каждая итерация — новое onLayout именно текущей плотности.
function settle(availableHeight, linesAtIndex = () => 4, questionText = question) {
  let index = 0;
  for (let step = 0; step < REFLECT_DENSITIES.length; step++) {
    const request = measured(index, linesAtIndex(index), { availableHeight });
    request.measurement.blockHeight = 28 + linesAtIndex(index)
      * reflectionQuestionType(questionText, REFLECT_DENSITIES[index].fontStep).line;
    const result = fitReflectDensity(request, sc);
    if (result.index === index) return result;
    assert.ok(result.index > index);
    if (REFLECT_DENSITIES[result.index].fontStep !== REFLECT_DENSITIES[index].fontStep) {
      assert.equal(result.index, index + 1);
    }
    index = result.index;
  }
  assert.fail('fitting must settle in at most one measurement per density');
}

test('a normal 850 dp phone keeps the original sizes', () => {
  const scale = 427 / 294;
  const available = (850 - 24 - 24) / scale - REFLECT_SPACING.top - 12;
  assert.deepEqual(settle(available), { index: 0, overflow: false });
});

test('a 758 dp phone fits both gesture and three-button navigation', () => {
  for (const bottomInset of [24, 48]) {
    const scale = 427 / 294;
    const available = (758 - 24 - bottomInset) / scale - REFLECT_SPACING.top - 12;
    assert.deepEqual(settle(available), { index: 4, overflow: false });
  }
});

test('each smaller font is remeasured before reducing decorations', () => {
  assert.deepEqual(settle(510), { index: 1, overflow: false });
  assert.deepEqual(settle(502), { index: 2, overflow: false });
  assert.deepEqual(settle(470), { index: 4, overflow: false });
});

test('stale density measurements cannot advance the new density', () => {
  const stale = measured(0).measurement;
  assert.deepEqual(fitReflectDensity(measured(1, 4, { measurement: stale }), sc),
    { index: 1, overflow: undefined });
  assert.deepEqual(fitReflectDensity(measured(1, 4, { measurement: undefined }), sc),
    { index: 1, overflow: undefined });
});

test('one fewer line at the smaller font stops at the earlier fitting step', () => {
  assert.deepEqual(settle(490, (index) => index === 0 ? 4 : 3), { index: 1, overflow: false });
  assert.deepEqual(settle(490), { index: 3, overflow: false });
});

test('opening, open and closing keyboards cannot alter the resting density', () => {
  for (const keyboardPhase of ['opening', 'open', 'closing']) {
    assert.deepEqual(fitReflectDensity(measured(0, 4, { availableHeight: 124, keyboardPhase }), sc),
      { index: 0, overflow: undefined });
  }
  assert.deepEqual(fitReflectDensity(measured(0, 4, { availableHeight: 600 }), sc),
    { index: 0, overflow: false });
});

test('a new question or window resets synchronously and rejects the old block measurement', () => {
  for (const nextContext of [JSON.stringify([427, 758, 'A new question?']), JSON.stringify([427, 850, question])]) {
    const index = reflectionDensityIndex({ context, index: 5 }, nextContext);
    assert.equal(index, 0);
    assert.deepEqual(fitReflectDensity(measured(index, 4, { context: nextContext }), sc),
      { index: 0, overflow: undefined });
    assert.deepEqual(fitReflectDensity(measured(index, 2, {
      context: nextContext,
      measurement: { context: nextContext, index, blockHeight: 86 },
    }), sc), { index: 0, overflow: false });
  }
  assert.equal(reflectionDensityIndex({ context, index: 4 }, context), 4);
});

test('a very long question fits at minimum density or explicitly requests scrolling', () => {
  const longQuestion = 'What part of this next step is asking for courage, and how could you bring that concern to God honestly before deciding what to do next?';
  assert.deepEqual(settle(500, () => 9, longQuestion), { index: 5, overflow: false });
  assert.deepEqual(settle(480, () => 9, longQuestion), { index: 5, overflow: true });
});


test('available height uses the native root frame and waits for its measurement', () => {
  assert.equal(reflectionAvailableHeight(undefined, 40, 12, 48), undefined);
  assert.equal(reflectionAvailableHeight(758, 40, 12, 48), 658);
  assert.equal(reflectionAvailableHeight(758, 40, 12, 24), 682);
  // Панель и её безопасная зона вычитаются из нативного root ровно один раз.
  assert.equal(reflectionAvailableHeight(850, 40, 12, 48), 750);
  assert.deepEqual(fitReflectDensity(measured(0, 4, { availableHeight: undefined }), sc),
    { index: 0, overflow: undefined });
});

test('decoration-only steps jump directly without waiting for intermediate frames', () => {
  for (const [availableHeight, index, overflow] of [[490, 3, false], [470, 4, false], [420, 5, false], [400, 5, true]]) {
    assert.deepEqual(fitReflectDensity(measured(2, 4, { availableHeight }), sc), { index, overflow });
  }
  assert.deepEqual(fitReflectDensity(measured(0, 4, { availableHeight: 400 }), sc),
    { index: 1, overflow: undefined });
  assert.deepEqual(fitReflectDensity(measured(1, 4, { availableHeight: 400 }), sc),
    { index: 2, overflow: undefined });
});

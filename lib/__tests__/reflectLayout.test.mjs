import assert from 'node:assert/strict';
import test from 'node:test';
import { REFLECT_DENSITIES, fitReflectDensity, reflectionQuestionType } from '../reflectLayout.ts';

const sc = (value) => value;
const shortQuestion = 'What should I carry from this prayer?';
const longQuestion = 'Where in this next step do you most want to speak to God first?';
const veryLongQuestion = 'What part of this next step is asking for courage, and how could you bring that concern to God honestly before deciding what to do next?';

const measured = (question, lines, availableHeight, densityIndex = 0) => ({
  question,
  questionLines: lines,
  questionBlockHeight: 28 + lines * reflectionQuestionType(question, REFLECT_DENSITIES[densityIndex].fontStep).line,
  actionsHeight: 100,
  availableHeight,
  densityIndex,
});

test('a roomy window keeps the question, flame and input at their original sizes', () => {
  assert.deepEqual(fitReflectDensity(measured(shortQuestion, 2, 500), sc), { index: 0, overflow: false });
});

test('a short window reduces question typography before the flame or input', () => {
  assert.deepEqual(fitReflectDensity(measured(longQuestion, 4, 510), sc), { index: 1, overflow: false });
  assert.deepEqual(fitReflectDensity(measured(longQuestion, 4, 502), sc), { index: 2, overflow: false });
  assert.deepEqual(fitReflectDensity(measured(longQuestion, 4, 470), sc), { index: 4, overflow: false });
});

test('a very long question uses the smallest layout and still reports unavoidable overflow', () => {
  assert.deepEqual(fitReflectDensity(measured(veryLongQuestion, 9, 500), sc), { index: 5, overflow: false });
  assert.deepEqual(fitReflectDensity(measured(veryLongQuestion, 9, 480), sc), { index: 5, overflow: true });
  assert.deepEqual(fitReflectDensity(measured(veryLongQuestion, 9, 500, 5), sc), { index: 5, overflow: false });
});

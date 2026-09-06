import assert from 'node:assert/strict';
import test from 'node:test';
import { buildQuestionRequest, limitQuestionRequest } from '../questionRequest.ts';

const answer = (text) => ({ text, recordings: [] });

test('replacement history is chronological, separate from answered turns, and absent on first stage', () => {
  const skipped = ['First?', 'Second?', 'Answered?'];
  const request = buildQuestionRequest('next', 'Topic', ['Answered?'], { 0: answer('Yes') }, skipped);
  assert.deepEqual(request.skipped_questions, ['First?', 'Second?']);
  assert.deepEqual(request.messages.map((m) => m.text), ['Answered?', 'Yes']);
  assert.equal(buildQuestionRequest('first', 'Topic', [], {}, skipped).skipped_questions, undefined);
  assert.deepEqual(buildQuestionRequest('reflect', 'Topic', [], {}, skipped).skipped_questions, skipped);
  assert.deepEqual(skipped, ['First?', 'Second?', 'Answered?']);
});

test('wire history retains the ten most recent skipped questions and bounds each entry', () => {
  const skipped = Array.from({ length: 13 }, (_, i) => `${i}: ${'x'.repeat(400)}`);
  const request = buildQuestionRequest('next', '', [], {}, skipped);
  assert.deepEqual(request.skipped_questions, skipped.slice(-10).map((q) => q.slice(0, 300)));
  assert.deepEqual(limitQuestionRequest(request), request);
});

test('skipped questions share the total budget without displacing the latest human reply', () => {
  const request = buildQuestionRequest('next', 'Topic', ['Answered?'], { 0: answer('x'.repeat(15_980)) }, ['Older skipped?', 'New?']);
  assert.deepEqual(request.skipped_questions, ['New?']);
  assert.equal(request.messages.at(-1).text.length, 15_980);
  const size = request.topic.length + request.messages.reduce((n, m) => n + m.text.length, 0)
    + request.skipped_questions.reduce((n, q) => n + q.length, 0);
  assert.ok(size <= 16_000);
});

test('answered texts remain excluded even when their messages exceed the retained history', () => {
  const request = buildQuestionRequest('next', '', ['Old?', 'New?'], {
    0: answer('x'.repeat(16_000)), 1: answer('Recent'),
  }, ['Old?', 'Skipped?']);
  assert.deepEqual(request.skipped_questions, ['Skipped?']);
});

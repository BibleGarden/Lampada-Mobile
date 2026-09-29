import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = ts.createSourceFile(
  'AnswerSheet.tsx',
  readFileSync(new URL('../../components/AnswerSheet.tsx', import.meta.url), 'utf8'),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);

function callsNamed(node, name) {
  const found = [];
  const visit = (child) => {
    if (ts.isCallExpression(child) && child.expression.getText(source) === name) found.push(child);
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

test('the answer sheet wires the tested native cap and terminal status handler', () => {
  assert.equal(callsNamed(source, 'startPreparedRecording').length, 1);
  const terminal = callsNamed(source, 'handleRecorderTerminalStatus');
  assert.equal(terminal.length, 1);
  assert.ok(callsNamed(terminal[0].arguments[5], 'finishLimitedRecording').length > 0);
});

test('returning from the background re-arms the tested native limit', () => {
  const appState = callsNamed(source, 'AppState.addEventListener');
  assert.equal(appState.length, 1);
  assert.ok(callsNamed(appState[0].arguments[1], 'rearmRecordingAfterForeground').length > 0);
});

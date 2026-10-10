import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = ts.transpileModule(readFileSync(new URL('../dismissKeyboard.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function nativeBindings({ focused, visible }) {
  const state = { focused, visible };
  const modules = {
    'react-native': { Keyboard: { dismiss() {
      if (state.focused) { state.focused = false; state.visible = false; }
    } } },
    'react-native-keyboard-controller': { KeyboardController: { dismiss() {
      // The supported controller returns immediately if its IME is closed.
      if (state.visible) { state.visible = false; state.focused = false; }
      return Promise.resolve();
    } } },
  };
  const module = { exports: {} };
  new Function('require', 'module', 'exports', source)((name) => {
    assert.ok(modules[name], `Unexpected native dependency: ${name}`);
    return modules[name];
  }, module, module.exports);
  return { state, dismiss: module.exports.dismissKeyboard };
}

test('finishing hardware input releases focus even when the native IME dismiss is a no-op', () => {
  const { state, dismiss } = nativeBindings({ focused: true, visible: false });
  dismiss();
  assert.deepEqual(state, { focused: false, visible: false });
});

test('finishing input hides an orphaned IME after React Native has already lost focus', () => {
  const { state, dismiss } = nativeBindings({ focused: false, visible: true });
  dismiss();
  assert.deepEqual(state, { focused: false, visible: false });
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { installEventTrace } from './events.mjs';

test('bounded structural event trace preserves first click witness and cleans up', () => {
  const listeners = new Map();
  const document = {
    addEventListener: (type, listener) => listeners.set(type, listener),
    removeEventListener: (type, listener) => {
      assert.equal(listeners.get(type), listener);
      listeners.delete(type);
    },
  };
  let expanded = 'false';
  const element = { getAttribute: () => expanded, isConnected: true };
  let now = 0;
  const trace = installEventTrace(document, element, () => now++, 2);
  const emit = (type, matched = true) =>
    listeners.get(type)({
      type,
      isTrusted: true,
      button: 0,
      buttons: type === 'mousedown' ? 1 : 0,
      target: { tagName: 'BUTTON', innerText: 'private', value: 'secret' },
      composedPath: () => (matched ? [element] : []),
    });
  emit('mousedown');
  expanded = 'true';
  emit('mouseup');
  emit('click');
  emit('click', false);
  const result = trace.read();
  assert.equal(result.events.length, 2);
  assert.equal(result.dropped, 2);
  assert.equal(result.events[0].buttons, 1);
  assert.equal(result.events[1].expanded, 'true');
  assert.equal(result.click.matched, true);
  assert.equal(result.click.ms, 3);
  assert.doesNotMatch(JSON.stringify(result), /private|secret/);
  trace.stop();
  assert.equal(listeners.size, 0);
});

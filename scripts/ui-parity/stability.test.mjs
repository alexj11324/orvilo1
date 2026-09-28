import assert from 'node:assert/strict';
import test from 'node:test';

import { createStabilityWindow } from './stability.mjs';

test('late sidebar semantics restart the baseline window', () => {
  const stable = createStabilityWindow();
  assert.equal(stable({ expanded: [] }, true, 0), false);
  assert.equal(stable({ expanded: ['Properties'] }, true, 1000), false);
  assert.equal(stable({ expanded: ['Properties'] }, true, 1500), false);
  assert.equal(stable({ expanded: ['Properties'] }, true, 2500), true);
});

test('loading, missing targets and destroyed contexts invalidate prior quiet time', () => {
  const stable = createStabilityWindow();
  assert.equal(stable('same state', true, 0), false);
  assert.equal(stable('same state', false, 1400), false);
  assert.equal(stable('same state', true, 1500), false);
  assert.equal(stable('same state', true, 3000), true);
});

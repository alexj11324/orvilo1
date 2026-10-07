import assert from 'node:assert/strict';
import test from 'node:test';

import { assertHoverCoverage, assertHoverFeedback, hasVisibleHover } from './hoverFeedback.mjs';

const paint = (background = [0, 0, 0, 0]) => ({
  background,
  opacity: 1,
  shadow: 'none',
  shadowVisible: false,
  visible: true,
});
const snapshot = (background) => ({
  ...paint(background),
  backdrop: [255, 255, 255],
  pseudos: [paint(), paint()],
});

test('unstyled, text-only and ancestor-only controls fail the executable judge', () => {
  const plain = snapshot();
  for (const name of ['unstyled', 'text-only', 'ancestor-only']) {
    assert.throws(() => assertHoverFeedback(name, plain, plain), /no visible hover/);
  }
});
test('light and dark semantic fills pass', () => {
  assert.ok(hasVisibleHover(snapshot(), snapshot([0, 0, 0, 0.03])));
  assert.ok(
    hasVisibleHover({ ...snapshot(), backdrop: [13, 13, 13] }, snapshot([255, 255, 255, 0.06])),
  );
  assert.ok(!hasVisibleHover({ ...snapshot(), backdrop: [0, 0, 0] }, snapshot([0, 0, 0, 0.06])));
});
test('filled buttons must change their paint, not merely have a resting fill', () => {
  assert.ok(!hasVisibleHover(snapshot([34, 34, 34, 1]), snapshot([34, 34, 34, 1])));
  assert.ok(hasVisibleHover(snapshot([34, 34, 34, 1]), snapshot([60, 60, 60, 1])));
});
test('visible shadow changes pass; transparent shadows and opacity-zero paint fail', () => {
  const shadow = { ...snapshot(), shadow: 'rgba(0, 0, 0, .2) 0px 1px 3px', shadowVisible: true };
  assert.ok(hasVisibleHover(snapshot(), shadow));
  assert.ok(!hasVisibleHover(snapshot(), { ...shadow, shadowVisible: false }));
  assert.ok(!hasVisibleHover(snapshot(), { ...snapshot([255, 255, 255, 1]), opacity: 0 }));
});
test('an owned visible pseudo-element wash passes; absent pseudo paint fails', () => {
  const hover = snapshot();
  hover.pseudos[0] = paint([200, 200, 200, 1]);
  assert.ok(hasVisibleHover(snapshot(), hover));
  hover.pseudos[0].visible = false;
  assert.ok(!hasVisibleHover(snapshot(), hover));
});
test('empty inventory and missing control types fail', () => {
  assert.throws(() => assertHoverCoverage([], ['ghost'], 1), /coverage/);
  assert.throws(() => assertHoverCoverage(['ghost'], ['link'], 1), /missing: link/);
  assert.doesNotThrow(() => assertHoverCoverage(['ghost', 'link'], ['ghost', 'link'], 2));
});

test('same-color pseudo on opaque control is not visible feedback', () => {
  const before = snapshot([200, 0, 0, 1]);
  const after = snapshot([200, 0, 0, 1]);
  after.pseudos[0] = paint([200, 0, 0, 1]);
  assert.equal(hasVisibleHover(before, after), false);
  assert.throws(() => assertHoverFeedback('same-color-pseudo', before, after), /no visible hover/);
});

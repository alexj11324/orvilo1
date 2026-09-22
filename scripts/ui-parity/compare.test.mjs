import assert from 'node:assert/strict';
import { test } from 'node:test';

import { compareSequences, compareTransitions, transition } from './compare.mjs';
import { isPendingIndicator, partitionPending, selectTargets } from './targets.mjs';

test('scoped loading remains blocking while shell loading is retained separately', () => {
  const pageSpinner = {};
  const shellSpinner = {};
  const root = { contains: (element) => element === pageSpinner };
  assert.deepEqual(partitionPending([root, pageSpinner, shellSpinner], root), {
    inside: [root, pageSpinner],
    outside: [shellSpinner],
  });
});

test('targets the interactive parent instead of its pointer-events-none label', () => {
  const label = { matches: () => false, contains: () => false };
  const button = { matches: () => true, contains: (other) => other === label };
  assert.deepEqual(selectTargets([button, label]), [button]);
  const duplicate = { matches: () => true, contains: () => false };
  assert.equal(selectTargets([button, label, duplicate]).length, 2);
  assert.deepEqual(selectTargets([label]), [label]);
});

test('distinguishes data progress from indeterminate loading and explicit busy state', () => {
  const element = (attributes) => ({
    getAttribute: (key) => attributes[key] ?? null,
    hasAttribute: (key) => Object.hasOwn(attributes, key),
  });
  assert.equal(isPendingIndicator(element({ 'role': 'progressbar', 'aria-valuenow': '0' })), false);
  assert.equal(isPendingIndicator(element({ role: 'progressbar' })), true);
  assert.equal(
    isPendingIndicator(
      element({ 'role': 'progressbar', 'aria-valuenow': '50', 'aria-busy': 'true' }),
    ),
    true,
  );
});

const before = {
  route: '/project/:id/overview',
  dialogs: [],
  menus: [],
  editors: [],
  selected: [],
  expanded: [],
  focus: '',
};
const run = (after) => ({
  hitVerified: true,
  eventVerified: true,
  settled: true,
  changed: true,
  effect: transition(before, { ...before, ...after }),
});

test('detects navigation versus inline expansion without an expected destination', () => {
  assert.equal(
    compareTransitions(
      run({ route: '/project/:id/activity', editors: ['textbox'] }),
      run({ editors: ['textbox'] }),
    ).verdict,
    'different',
  );
});
test('detects wrong destination despite both pages opening editors', () => {
  assert.equal(
    compareTransitions(run({ route: '/project/:id/activity' }), run({ route: '/settings' }))
      .verdict,
    'different',
  );
});
test('rejects misclicks, unsettled pages, and unobserved click events', () => {
  for (const field of ['hitVerified', 'settled', 'eventVerified']) {
    assert.equal(
      compareTransitions(run({}), { ...run({}), [field]: false }).verdict,
      'inconclusive',
    );
  }
});
test('does not accept two inert controls as parity', () => {
  assert.equal(compareTransitions({ ...run({}), changed: false }, run({})).verdict, 'inconclusive');
});
test('detects missing editor and changed menu behavior', () => {
  assert.equal(
    compareTransitions(run({ editors: ['textbox'] }), run({ menus: ['menu'] })).verdict,
    'different',
  );
});
test('matching measured transitions have a scoped verdict', () => {
  assert.equal(
    compareTransitions(
      run({ route: '/project/:id/activity' }),
      run({ route: '/project/:id/activity' }),
    ).verdict,
    'observed-match',
  );
});

test('compares every action in a sequence instead of only the final state', () => {
  const matchingSecond = run({ dialogs: ['dialog:Properties'] });
  assert.equal(
    compareSequences(
      [run({ menus: ['menu:Actions'] }), matchingSecond],
      [run({ dialogs: ['dialog:Wrong first step'] }), matchingSecond],
    ).verdict,
    'different',
  );
});

test('a reload observation may match without inventing a click or semantic change', () => {
  const reload = {
    actionType: 'reload',
    actionVerified: true,
    settled: true,
    changed: false,
    after: before,
    effect: transition(before, before),
  };
  assert.equal(compareSequences([reload], [reload]).verdict, 'observed-match');
});

test('an unverified sequence step is inconclusive even when later steps match', () => {
  const untrusted = { ...run({ menus: ['menu:Actions'] }), eventVerified: false };
  assert.equal(
    compareSequences(
      [untrusted, run({ dialogs: ['dialog:Properties'] })],
      [run({ menus: ['menu:Actions'] }), run({ dialogs: ['dialog:Properties'] })],
    ).verdict,
    'inconclusive',
  );
});

test('an empty or truncated sequence cannot pass', () => {
  assert.equal(compareSequences([], []).verdict, 'inconclusive');
  assert.equal(compareSequences([run({})], []).verdict, 'inconclusive');
});

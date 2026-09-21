#!/usr/bin/env node
/**
 * Falsifiability tests for the strict slimming boundary gate (ORV-116).
 *
 * Each test builds a minimal synthetic census object containing exactly one
 * injected violation and asserts evaluateCheck flags it — plus a clean-census
 * control proving the gate passes when nothing is wrong. Runs with plain
 * `node --test` — no repo deps. Wired into the slimming-boundary CI job so the
 * gate proves it can actually go red.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateCheck, isDispositionConflict } from './census.mjs';

const cleanCensus = () => ({
  uncoveredFiles: [],
  conflictingDispositionFiles: [],
  investigateCapabilities: [],
  deleteCapabilitiesWithFiles: [],
  unresolvedImports: [],
  capabilities: [
    {
      id: 'keeper',
      disposition: 'KEEP',
      fileCount: 3,
      inbound: { total: 1, explained: 1, unexplained: [] },
    },
  ],
});

test('clean census passes', () => {
  assert.deepEqual(evaluateCheck(cleanCensus()), []);
});

test('fails on uncovered source files', () => {
  const c = cleanCensus();
  c.uncoveredFiles = ['src/features/Orphan/index.ts'];
  assert.equal(evaluateCheck(c)[0].rule, 'uncovered source files');
});

test('fails on conflicting dispositions', () => {
  const c = cleanCensus();
  c.conflictingDispositionFiles = [
    { file: 'src/x.ts', capabilities: ['a', 'b'], dispositions: ['KEEP', 'DELETE'] },
  ];
  assert.equal(evaluateCheck(c)[0].rule, 'conflicting dispositions');
});

test('fails on INVESTIGATE capabilities', () => {
  const c = cleanCensus();
  c.investigateCapabilities = [{ id: 'limbo', fileCount: 9 }];
  assert.equal(evaluateCheck(c)[0].rule, 'INVESTIGATE capabilities remaining');
});

test('fails on DELETE capabilities still matching files', () => {
  const c = cleanCensus();
  c.deleteCapabilitiesWithFiles = [{ id: 'zombie', fileCount: 4 }];
  assert.equal(evaluateCheck(c)[0].rule, 'DELETE capabilities still matching files');
});

test('fails on unexplained inbound into DELETE capability', () => {
  const c = cleanCensus();
  c.capabilities.push({
    id: 'dead-surface',
    disposition: 'DELETE',
    fileCount: 0,
    inbound: {
      total: 1,
      explained: 0,
      unexplained: [{ importer: 'src/live.ts', disposition: 'KEEP', targets: ['x'] }],
    },
  });
  assert.equal(
    evaluateCheck(c)[0].rule,
    'DELETE capabilities with unexplained inbound dependencies',
  );
});

test('fails on unresolved internal imports', () => {
  const c = cleanCensus();
  c.unresolvedImports = [
    { importer: 'src/a.ts', specifier: './missing', via: 'relative', exempted: false },
  ];
  assert.equal(evaluateCheck(c)[0].rule, 'unresolved internal imports');
});

test('exempted unresolved imports do not fail', () => {
  const c = cleanCensus();
  c.unresolvedImports = [
    { importer: 'src/a.ts', specifier: './generated', via: 'relative', exempted: true },
  ];
  assert.deepEqual(evaluateCheck(c), []);
});

const capSet = (entries) => entries.map(([id, disposition]) => ({ id, disposition }));

test('isDispositionConflict flags cross-disposition overlap', () => {
  const caps = capSet([
    ['base', 'KEEP'],
    ['doomed', 'DELETE'],
  ]);
  assert.equal(isDispositionConflict(['base', 'doomed'], caps), true);
});

test('isDispositionConflict honors a ledger overlap allowance', () => {
  const caps = capSet([
    ['base', 'KEEP'],
    ['domain', 'REWRITE_FOR_ACP'],
  ]);
  const allowances = [{ broad: 'base', narrow: 'domain' }];
  assert.equal(isDispositionConflict(['base', 'domain'], caps, allowances), false);
  // ...but the same overlap with no allowance, or a different cap in the mix, fails
  assert.equal(isDispositionConflict(['base', 'domain'], caps), true);
  caps.push({ id: 'other', disposition: 'DELETE' });
  assert.equal(isDispositionConflict(['base', 'domain', 'other'], caps, allowances), true);
});

test('isDispositionConflict ignores same-disposition multi-claims', () => {
  const caps = capSet([
    ['a', 'KEEP'],
    ['b', 'KEEP'],
  ]);
  assert.equal(isDispositionConflict(['a', 'b'], caps), false);
});

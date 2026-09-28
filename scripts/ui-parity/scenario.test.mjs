import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { assertAuthorizedScenario, authorizationPlan } from './authorization.mjs';
import {
  normalizeLocationRoute,
  parseActions,
  routeMappingsForSurface,
  validateSurfaceMappings,
} from './scenario.mjs';

test('keeps the legacy single-action configuration compatible', () => {
  assert.deepEqual(parseActions({ action: { names: ['Open'], safety: 'read-only' } }), [
    { names: ['Open'], safety: 'read-only', type: 'click' },
  ]);
});

test('accepts an ordered read-only click and reload sequence', () => {
  assert.deepEqual(
    parseActions({
      actions: [
        { names: ['Open menu'], safety: 'read-only' },
        { names: ['Properties'], safety: 'read-only', type: 'click' },
        { safety: 'read-only', type: 'reload' },
      ],
    }).map(({ type }) => type),
    ['click', 'click', 'reload'],
  );
});

test('rejects ambiguous, mutating, and malformed actions before connecting', () => {
  for (const config of [
    {},
    { action: { names: ['Open'], safety: 'read-only' }, actions: [] },
    { actions: [] },
    { actions: [{ names: ['Delete'], safety: 'write' }] },
    { actions: [{ names: [], safety: 'read-only' }] },
    { actions: [{ names: ['Open'], safety: 'read-only', type: 'reload' }] },
    { actions: [{ safety: 'read-only', type: 'submit' }] },
  ]) {
    assert.throws(() => parseActions(config));
  }
});

test('only applies start-URL identity mappings to routes while retaining old mapping configs', () => {
  const surface = {
    start: 'https://example.test/workspace/project/entity/overview',
    mappings: [
      ['/workspace', '/:workspace'],
      ['entity', ':project'],
      ['settings', ':project'],
      ['private label', 'public label'],
      ['project/entity', ':project'],
    ],
  };
  assert.doesNotThrow(() => validateSurfaceMappings(surface, 'reference'));
  assert.deepEqual(routeMappingsForSurface(surface), [
    { context: [''], from: 'workspace', index: 1, kind: 'path', to: ':workspace' },
    {
      context: ['', 'workspace', 'project'],
      from: 'entity',
      index: 3,
      kind: 'path',
      to: ':project',
    },
  ]);
});

test('normalization replaces exact identities without hiding a different page', () => {
  const mappings = [
    { context: [''], from: 'workspace-id', index: 1, kind: 'path', to: ':workspace' },
    { from: 'workspace-id', index: 0, key: 'owner', kind: 'query', to: ':workspace' },
    { context: [], from: 'workspace-id', index: 0, kind: 'hash', to: ':workspace' },
  ];
  assert.equal(
    normalizeLocationRoute(
      '/workspace-id/project/settings-workspace-id',
      '?owner=workspace-id',
      '#workspace-id/details',
      mappings,
    ),
    '/:workspace/project/settings-workspace-id?owner=%3Aworkspace#:workspace/details',
  );
});

test('route identity mappings are position-bound and cannot normalize a new destination', () => {
  const surface = {
    start: 'https://example.test/workspace/project/entity/overview',
    mappings: [
      ['workspace', ':workspace'],
      ['entity', ':project'],
      ['settings', ':page'],
    ],
  };
  const mappings = routeMappingsForSurface(surface);
  assert.deepEqual(mappings, [
    { context: [''], from: 'workspace', index: 1, kind: 'path', to: ':workspace' },
    {
      context: ['', 'workspace', 'project'],
      from: 'entity',
      index: 3,
      kind: 'path',
      to: ':project',
    },
  ]);
  assert.equal(
    normalizeLocationRoute('/other/workspace/settings', '', '', mappings),
    '/other/workspace/settings',
  );
});

test('normalization preserves repeated query entries and their order', () => {
  const reference = routeMappingsForSurface({
    start: 'https://example.test/project?owner=ref&owner=admin',
    mappings: [['ref', ':owner']],
  });
  const candidate = routeMappingsForSurface({
    start: 'https://example.test/project?owner=cand&owner=guest',
    mappings: [['cand', ':owner']],
  });
  const referenceRoute = normalizeLocationRoute(
    '/project',
    '?owner=ref&owner=admin',
    '',
    reference,
  );
  const candidateRoute = normalizeLocationRoute(
    '/project',
    '?owner=cand&owner=guest',
    '',
    candidate,
  );
  assert.equal(referenceRoute, '/project?owner=%3Aowner&owner=admin');
  assert.equal(candidateRoute, '/project?owner=%3Aowner&owner=guest');
  assert.notEqual(referenceRoute, candidateRoute);
});

test('path identity mapping is bound to its original semantic prefix', () => {
  const reference = routeMappingsForSurface({
    start: 'https://example.test/workspace/project/ref/overview',
    mappings: [['ref', ':entity']],
  });
  const candidate = routeMappingsForSurface({
    start: 'https://example.test/workspace/project/cand/overview',
    mappings: [['cand', ':entity']],
  });
  assert.notEqual(
    normalizeLocationRoute('/workspace/team/ref/settings', '', '', reference),
    normalizeLocationRoute('/workspace/team/cand/settings', '', '', candidate),
  );
  assert.equal(
    normalizeLocationRoute('/workspace/project/ref/activity', '', '', reference),
    normalizeLocationRoute('/workspace/project/cand/activity', '', '', candidate),
  );
});

test('query identity mapping is bound to its original key', () => {
  const reference = routeMappingsForSurface({
    start: 'https://example.test/overview?project=ref',
    mappings: [['ref', ':entity']],
  });
  const candidate = routeMappingsForSurface({
    start: 'https://example.test/overview?project=cand',
    mappings: [['cand', ':entity']],
  });
  assert.notEqual(
    normalizeLocationRoute('/settings', '?team=ref', '', reference),
    normalizeLocationRoute('/settings', '?team=cand', '', candidate),
  );
  assert.equal(
    normalizeLocationRoute('/activity', '?project=ref', '', reference),
    normalizeLocationRoute('/activity', '?project=cand', '', candidate),
  );
});

test('hash identity mapping is bound to its original semantic prefix', () => {
  const reference = routeMappingsForSurface({
    start: 'https://example.test/#/project/ref/overview',
    mappings: [['ref', ':entity']],
  });
  const candidate = routeMappingsForSurface({
    start: 'https://example.test/#/project/cand/overview',
    mappings: [['cand', ':entity']],
  });
  assert.notEqual(
    normalizeLocationRoute('/', '', '#/team/ref/settings', reference),
    normalizeLocationRoute('/', '', '#/team/cand/settings', candidate),
  );
  assert.equal(
    normalizeLocationRoute('/', '', '#/project/ref/activity', reference),
    normalizeLocationRoute('/', '', '#/project/cand/activity', candidate),
  );
});

const authorizationConfig = () => ({
  authorization: 'approved-view-flow',
  actions: [
    { names: ['Open menu'], safety: 'read-only' },
    { names: ['View activity'], safety: 'read-only' },
  ],
  candidate: {
    cdp: 'http://localhost:9223',
    match: 'app://renderer/',
    start: 'app://renderer/workspace/project/entity/overview',
  },
  reference: {
    cdp: 'http://localhost:9222',
    match: 'https://linear.app/',
    start: 'https://linear.app/workspace/project/entity/overview',
  },
});

const readShippedConfig = async () =>
  JSON.parse(await readFile(new URL('./composer.example.json', import.meta.url), 'utf8'));

const runCli = (configFile, output) =>
  new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [fileURLToPath(new URL('./run.mjs', import.meta.url)), configFile, output],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stderr, stdout }));
  });

test('a read-only claim alone cannot authorize an arbitrary multi-step click flow', async () => {
  const config = await readShippedConfig();
  delete config.action;
  config.actions = [
    { names: ['Delete'], safety: 'read-only' },
    { names: ['Confirm'], safety: 'read-only' },
  ];
  assert.throws(
    () => assertAuthorizedScenario(config, parseActions(config)),
    /does not match its registered execution plan/,
  );
});

test('authorization is bound to exact surfaces, target selectors, and ordered steps', () => {
  const config = authorizationConfig();
  config.actions[0].selector = '[data-safe-menu-trigger]';
  const actions = parseActions(config);
  const registry = { [config.authorization]: authorizationPlan(config, actions) };
  assert.doesNotThrow(() => assertAuthorizedScenario(config, actions, registry));

  for (const mutate of [
    (changed) => changed.actions.push({ names: ['Another step'], safety: 'read-only' }),
    (changed) => (changed.actions[0].names = ['Delete']),
    (changed) => (changed.actions[0].selector = 'button'),
    (changed) => (changed.reference.start = 'https://linear.app/workspace/settings'),
    (changed) => (changed.reference.match = 'https://example.test/'),
    (changed) => (changed.reference.cdp = 'http://localhost:9999'),
  ]) {
    const changed = structuredClone(config);
    mutate(changed);
    assert.throws(
      () => assertAuthorizedScenario(changed, parseActions(changed), registry),
      /does not match its registered execution plan/,
    );
  }
});

test('the shipped example exactly matches its reviewed authorization entry', async () => {
  const config = await readShippedConfig();
  const actions = parseActions(config);
  assert.doesNotThrow(() => assertAuthorizedScenario(config, actions));
});

test('the CLI denies a relabeled destructive flow before attempting CDP', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ui-parity-auth-'));
  try {
    const config = await readShippedConfig();
    delete config.action;
    config.actions = [
      { names: ['Delete'], safety: 'read-only' },
      { names: ['Confirm'], safety: 'read-only' },
    ];
    config.reference.cdp = 'http://127.0.0.1:1';
    config.candidate.cdp = 'http://127.0.0.1:1';
    const configFile = path.join(directory, 'scenario.json');
    await writeFile(configFile, JSON.stringify(config));
    const result = await runCli(configFile, path.join(directory, 'output'));
    assert.equal(result.code, 1);
    assert.match(result.stderr, /Execution denied.*does not match its registered execution plan/s);
    assert.doesNotMatch(result.stderr, /fetch failed|ECONNREFUSED/);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

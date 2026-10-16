import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// Duplicate copies of @hatchet-dev/typescript-sdk make HatchetClient and
// workflow declarations incompatible during the full typecheck.
test('workspace importers resolve a single Hatchet SDK version', () => {
  const lockfile = readFileSync(new URL('../../pnpm-lock.yaml', import.meta.url), 'utf8');
  const resolved = [
    ...lockfile.matchAll(
      /'@hatchet-dev\/typescript-sdk':\n\s+specifier: .+\n\s+version: ([^(\n]+)/g,
    ),
  ].map((match) => match[1]);
  const published = [...lockfile.matchAll(/^ {2}'@hatchet-dev\/typescript-sdk@([^'(]+)':$/gm)].map(
    (match) => match[1],
  );

  assert.ok(resolved.length >= 2, 'expected the root and server importers');
  assert.deepEqual([...new Set(resolved)], [resolved[0]]);
  assert.deepEqual(published, [resolved[0]]);
});

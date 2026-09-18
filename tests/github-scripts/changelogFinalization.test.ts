// @vitest-environment node
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

let fixture: string | undefined;

afterEach(async () => {
  vi.doUnmock('../../scripts/changelogWorkflow/const');
  vi.resetModules();
  if (fixture) await rm(fixture, { force: true, recursive: true });
});

it('refreshes the finalized version in static JSON while retaining historical entries', async () => {
  fixture = await mkdtemp(path.join(os.tmpdir(), 'orvilo-final-changelog-'));
  const output = path.join(fixture, 'changelog');
  const markdown = path.join(fixture, 'CHANGELOG.md');
  await mkdir(output);
  const previous = {
    children: { fixes: ['Previously published fix.'] },
    date: '2026-09-01',
    version: '1.0.0',
  };
  await writeFile(
    path.join(output, 'v1.json'),
    JSON.stringify([
      { children: { fixes: ['Original cut.'] }, date: '2026-09-18', version: '1.0.1' },
      previous,
    ]),
  );
  await writeFile(
    markdown,
    `# Changelog

### [Version 1.0.1](https://example.test/v1.0.1)

<sup>Released on **2026-09-18**</sup>

#### 🐛 Bug Fixes

- **misc**: Fix added during review.

### [Version 1.0.0](https://example.test/v1.0.0)

<sup>Released on **2026-09-01**</sup>

#### 🐛 Bug Fixes

- **misc**: An archived source entry.
`,
  );
  vi.doMock('../../scripts/changelogWorkflow/const', () => ({
    CHANGELOG_DIR: output,
    CHANGELOG_FILE: { v1: markdown },
  }));
  const { buildStaticChangelog } =
    await import('../../scripts/changelogWorkflow/buildStaticChangelog');
  buildStaticChangelog.run('1.0.1');
  const first = JSON.parse(await readFile(path.join(output, 'v1.json'), 'utf8'));
  expect(first).toEqual([
    {
      children: { fixes: ['Fix added during review.'] },
      date: '2026-09-18',
      version: '1.0.1',
    },
    previous,
  ]);
  buildStaticChangelog.run('1.0.1');
  expect(JSON.parse(await readFile(path.join(output, 'v1.json'), 'utf8'))).toEqual(first);
});

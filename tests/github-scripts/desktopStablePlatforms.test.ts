// @vitest-environment node
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { parse } from 'yaml';

it.each(['release', 'workflow_dispatch'])(
  'only exposes approved macOS builds on %s',
  async (event) => {
    const workflow = parse(await readFile('.github/workflows/release-desktop-stable.yml', 'utf8'));
    const step = workflow.jobs['configure-build'].steps.find(
      (s: { id?: string }) => s.id === 'set-matrix',
    );
    const script = step.run
      .replaceAll('${{ github.event_name }}', event)
      .replaceAll(/\$\{\{ inputs\.build_\w+ \}\}/g, 'true');
    const directory = await mkdtemp(path.join(tmpdir(), 'desktop-platforms-'));
    try {
      const output = path.join(directory, 'output');
      await promisify(execFile)('bash', ['-eu', '-c', script], {
        env: { ...process.env, GITHUB_OUTPUT: output },
      });
      const matrix = JSON.parse((await readFile(output, 'utf8')).trim().slice('matrix='.length));
      expect(matrix.include.map((entry: { name: string }) => entry.name)).toEqual([
        'macos-arm64',
        'macos-intel',
      ]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);

it.each(['beta', 'canary'])('does not publish unapproved platforms through %s', async (channel) => {
  const workflow = parse(
    await readFile(`.github/workflows/release-desktop-${channel}.yml`, 'utf8'),
  );
  const runners: string[] = workflow.jobs.build.strategy.matrix.os;
  expect(runners).toContain('windows-2025');
  expect(runners).toContain('ubuntu-latest');
  const downloadStep = workflow.jobs['merge-mac-files'].steps.find((step: { uses?: string }) =>
    step.uses?.startsWith('actions/download-artifact@'),
  );
  expect(downloadStep.with.pattern).toBe('release-macos-*');

  const integrityStep = workflow.jobs['merge-mac-files'].steps.find((step: { run?: string }) =>
    step.run?.includes('validateMainHash.mjs'),
  );
  const expectedArtifacts = integrityStep.run.trim().split(/\s+/).slice(3);
  expect(expectedArtifacts).toEqual(
    runners.filter((runner) => runner.startsWith('macos-')).map((runner) => `release-${runner}`),
  );

  const publishStep = workflow.jobs['publish-release'].steps.find((step: { uses?: string }) =>
    step.uses?.startsWith('softprops/action-gh-release@'),
  );
  expect(publishStep.with.files.trim().split('\n')).toEqual([
    'release/latest-mac.yml',
    'release/*.dmg*',
    'release/*.zip*',
  ]);
});

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

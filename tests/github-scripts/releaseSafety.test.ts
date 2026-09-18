// @vitest-environment node
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { parse } from 'yaml';

const exec = promisify(execFile);
const workflowRoot = path.resolve(process.cwd(), '.github/workflows');

interface Step {
  env?: Record<string, string>;
  name?: string;
  run?: string;
  uses?: string;
  with?: Record<string, string>;
}

async function steps(file: string, job: string): Promise<Step[]> {
  return parse(await readFile(path.join(workflowRoot, file), 'utf8')).jobs[job].steps;
}

describe('Release safety', () => {
  it('requires an event-producing token and checks out the merged PR commit', async () => {
    const release = await steps('auto-tag-release.yml', 'auto-tag');
    const checkout = release.find((step) => step.uses?.startsWith('actions/checkout@'));
    const publish = release.find((step) => step.name === 'Create GitHub Release');
    const guard = release.find((step) => step.name === 'Require release event token');

    expect(checkout?.with?.ref).toBe('${{ github.event.pull_request.merge_commit_sha }}');
    expect(checkout?.with?.token).toBe('${{ secrets.GH_TOKEN }}');
    expect(publish?.env?.GITHUB_TOKEN).toBe('${{ secrets.GH_TOKEN }}');
    expect(guard?.run).toBeDefined();
    await expect(
      exec('bash', ['-eu', '-c', guard!.run!], { env: { ...process.env, RELEASE_TOKEN: '' } }),
    ).rejects.toThrow(/GH_TOKEN/);
    await exec('bash', ['-eu', '-c', guard!.run!], {
      env: { ...process.env, RELEASE_TOKEN: 'test-event-token' },
    });
  });

  it.each(['conflict', 'already-synced'] as const)(
    'keeps the sync branch safe when %s',
    async (scenario) => {
      const root = await mkdtemp(path.join(os.tmpdir(), 'release-sync-'));
      const remote = path.join(root, 'remote.git');
      const checkout = path.join(root, 'checkout');
      const calls = path.join(root, 'gh-calls');
      const git = (...args: string[]) => exec('git', args, { cwd: checkout });
      try {
        await exec('git', ['init', '--bare', remote]);
        await exec('git', ['clone', remote, checkout]);
        await git('config', 'user.name', 'Release Test');
        await git('config', 'user.email', 'release-test@example.com');
        await git('checkout', '-b', 'main');
        await writeFile(path.join(checkout, 'content.txt'), 'base\n');
        await git('add', 'content.txt');
        await git('commit', '-m', 'base');
        await git('checkout', '-b', 'canary');
        await writeFile(path.join(checkout, 'content.txt'), 'canary\n');
        await git('commit', '-am', 'canary change');
        await git('checkout', 'main');
        if (scenario === 'conflict') {
          await writeFile(path.join(checkout, 'content.txt'), 'main\n');
          await git('commit', '-am', 'main change');
        }
        await git('push', 'origin', 'main', 'canary');
        const sync = (await steps('sync-main-to-canary.yaml', 'sync-branches')).find(
          (step) => step.name === 'Open or refresh the sync pull request',
        );
        expect(sync?.run).toBeDefined();
        await exec(
          'bash',
          [
            '-eu',
            '-c',
            `gh() {
  if [ "$1 $2" = "pr list" ]; then return 0; fi
  printf '%s\\n' "$@" >> "$GH_CALLS"
}
${sync!.run}`,
          ],
          { cwd: checkout, env: { ...process.env, GH_CALLS: calls, GITHUB_RUN_ID: '42' } },
        );
        if (scenario === 'conflict') {
          const head = (await git('rev-parse', 'HEAD')).stdout.trim();
          expect(head).toBe((await git('rev-parse', 'origin/main')).stdout.trim());
          expect(await readFile(path.join(checkout, 'content.txt'), 'utf8')).toBe('main\n');
          expect(await readFile(calls, 'utf8')).toContain('--draft\n');
        } else {
          expect((await git('branch', '--list', 'sync/*')).stdout.trim()).toBe('');
          await expect(readFile(calls, 'utf8')).rejects.toThrow(/ENOENT/);
        }
      } finally {
        await rm(root, { force: true, recursive: true });
      }
    },
  );
});

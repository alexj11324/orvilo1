// @vitest-environment node
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const exec = promisify(execFile);
const repositoryRoot = path.resolve(process.cwd());
const workflowRoot = path.join(repositoryRoot, '.github/workflows');
const channelWorkflows = [
  'release-desktop-stable.yml',
  'release-desktop-beta.yml',
  'release-desktop-canary.yml',
] as const;
const cloudRevision = 'a'.repeat(40);

interface WorkflowStep {
  name?: string;
  run?: string;
}

async function resolveCloudStep(file: string): Promise<string> {
  const workflow = parse(await readFile(path.join(workflowRoot, file), 'utf8'));
  const jobs = Object.values(workflow.jobs) as Array<{ steps?: WorkflowStep[] }>;
  const step = jobs
    .flatMap((job) => job.steps ?? [])
    .find((candidate) => candidate.name === 'Resolve Cloud revision');

  if (!step?.run) throw new Error(`Resolve Cloud revision step missing from ${file}`);
  return step.run;
}

async function runResolveCloudStep(
  script: string,
  overrides: { cloudRepository: string; cloudToken: string },
) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'orvilo-desktop-release-'));
  const output = path.join(root, 'github-output');
  const gitCalled = path.join(root, 'git-called');
  const wrapped = `
git() {
  printf '%s\\n' called > "$GIT_CALLED"
  return 99
}
${script}
`;

  try {
    try {
      const result = await exec('bash', ['-eu', '-c', wrapped], {
        env: {
          ...process.env,
          CLOUD_REPOSITORY: overrides.cloudRepository,
          CLOUD_TOKEN: overrides.cloudToken,
          GITHUB_OUTPUT: output,
          GITHUB_SHA: cloudRevision,
          GIT_CALLED: gitCalled,
        },
      });
      return { exitCode: 0, output: await readFile(output, 'utf8'), text: result.stdout };
    } catch (error) {
      const failure = error as { code?: number; stderr?: string; stdout?: string };
      return {
        exitCode: failure.code ?? 1,
        output: await readFile(output, 'utf8').catch(() => ''),
        text: `${failure.stdout ?? ''}\n${failure.stderr ?? ''}`,
      };
    }
  } finally {
    await rm(root, { force: true, recursive: true });
  }
}

describe('desktop release workflow safety', () => {
  it.each(channelWorkflows)(
    'uses the current commit as cloudRef for an OSS-only %s build',
    async (file) => {
      const result = await runResolveCloudStep(await resolveCloudStep(file), {
        cloudRepository: '',
        cloudToken: '',
      });

      expect(result.exitCode).toBe(0);
      expect(result.output).toContain(`cloud_ref=${cloudRevision}`);
    },
  );

  it.each(channelWorkflows)(
    'rejects a partial Cloud overlay credential pair in %s',
    async (file) => {
      const result = await runResolveCloudStep(await resolveCloudStep(file), {
        cloudRepository: 'private/orvilo-cloud',
        cloudToken: '',
      });

      expect(result.exitCode).not.toBe(0);
      expect(result.text).toContain('must be provided together');
    },
  );

  it('keeps the renderer main hash independent of the cloudRef commit identity', async () => {
    const { collectSourceInputs } = await import('../../apps/desktop/scripts/mainHash.mjs');
    const previousSha = process.env.GITHUB_SHA;

    try {
      process.env.GITHUB_SHA = 'a'.repeat(40);
      const first = await collectSourceInputs({ repoRoot: repositoryRoot, graph: [] });
      process.env.GITHUB_SHA = 'b'.repeat(40);
      const second = await collectSourceInputs({ repoRoot: repositoryRoot, graph: [] });

      expect(first.mainHash).toBe(second.mainHash);
    } finally {
      if (previousSha === undefined) delete process.env.GITHUB_SHA;
      else process.env.GITHUB_SHA = previousSha;
    }
  });
});

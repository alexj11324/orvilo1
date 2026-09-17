import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';
import { parse } from 'yaml';

interface CompositeAction {
  runs: { steps: Array<{ run: string }> };
}

const action = parse(
  readFileSync(
    path.resolve(import.meta.dirname, '../.github/actions/resolve-preview-database/action.yml'),
    'utf8',
  ),
) as CompositeAction;
const run = action.runs.steps[0].run;
const fixtureDirectory = mkdtempSync(path.join(tmpdir(), 'resolve-preview-database-'));

afterAll(() => rmSync(fixtureDirectory, { force: true, recursive: true }));

describe('Resolve Preview database composite action', () => {
  it('is valid Bash after YAML block-scalar parsing', () => {
    const result = spawnSync('bash', ['-n'], { input: run });

    expect(result.stderr.toString()).toBe('');
    expect(result.status).toBe(0);
  });

  it('resolves a manual deployment branch to its per-PR database', () => {
    const binDirectory = path.join(fixtureDirectory, 'bin');
    const outputFile = path.join(fixtureDirectory, 'github-output');
    mkdirSync(binDirectory);
    const curl = path.join(binDirectory, 'curl');
    writeFileSync(
      curl,
      `#!/usr/bin/env bash
printf '%s' '[{"number":18,"head":{"repo":{"full_name":"alexj11324/orvilo1"},"ref":"feat/vercel-preview-infra"}}]'
`,
    );
    chmodSync(curl, 0o755);

    const result = spawnSync('bash', ['-c', run], {
      env: {
        ...process.env,
        DEPLOYMENT_REF: 'feat/vercel-preview-infra',
        EPHEMERAL_ENABLED: 'true',
        FALLBACK_URL: 'postgresql://shared:secret@db.example/orvilo_preview',
        GITHUB_API_URL: 'https://api.github.test',
        GITHUB_OUTPUT: outputFile,
        GITHUB_REPOSITORY: 'alexj11324/orvilo1',
        GITHUB_REPOSITORY_OWNER: 'alexj11324',
        GITHUB_TOKEN: 'test-token',
        PATH: `${binDirectory}:${process.env.PATH}`,
        PER_PR_BASE_URL: 'postgresql://ci:secret@db.example/orvilo_preview',
      },
    });

    expect(result.stderr.toString()).toBe('');
    expect(result.status).toBe(0);
    expect(readFileSync(outputFile, 'utf8')).toContain(
      'database-url=postgresql://ci:secret@db.example/orvilo_pr_18',
    );
    expect(result.stdout.toString()).toContain(
      'resolved database source=restricted CI role for PR #18 host=db.example database=orvilo_pr_18',
    );
  });
});

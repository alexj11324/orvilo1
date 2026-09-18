import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

interface WorkflowJob {
  'env'?: Record<string, string>;
  'if'?: string;
  'needs'?: string | string[];
  'runs-on'?: string;
  'steps'?: Array<{ name?: string; run?: string; uses?: string }>;
}

const workflow = parse(
  readFileSync(
    path.resolve(import.meta.dirname, '../.github/workflows/deploy-orvilo1.yml'),
    'utf8',
  ),
) as { jobs: Record<string, WorkflowJob> };

describe('Oracle deployment workflow', () => {
  it('builds only in GitHub Actions and deploys only after exact-head CI', () => {
    const build = workflow.jobs.build;
    const gate = workflow.jobs['ci-gate'];
    const deploy = workflow.jobs.deploy;

    expect(build['runs-on']).toBe('ubuntu-24.04-arm');
    expect(gate.if).toContain("github.ref == 'refs/heads/main'");
    expect(gate.env?.REQUIRED_WORKFLOWS).toBe('Test CI,E2E CI');
    expect(gate.env?.REQUIRED_EVENT).toBe('push');
    expect(deploy.needs).toBe('ci-gate');
    expect(deploy.if).toContain("needs.ci-gate.result == 'success'");
    expect(deploy.if).toContain("github.ref == 'refs/heads/main'");
  });
});

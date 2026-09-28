import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const workflow = parse(
  readFileSync(
    path.resolve(import.meta.dirname, '../.github/workflows/vercel-preview.yml'),
    'utf8',
  ),
) as {
  on: { pull_request_target: { types: string[] } };
  jobs: Record<
    string,
    {
      'if'?: string;
      'needs'?: string;
      'env'?: Record<string, string | number>;
      'steps'?: unknown[];
      'timeout-minutes'?: number;
    }
  >;
};

describe('gated Vercel Preview workflow', () => {
  it('runs the privileged gate from the base revision on PR changes', () => {
    expect(workflow.on.pull_request_target.types).toEqual([
      'opened',
      'reopened',
      'synchronize',
      'closed',
    ]);
    expect(workflow.jobs.gate.if).toContain("github.event.action != 'closed'");
    expect(workflow.jobs.gate.if).toContain(
      'pull_request.head.repo.full_name == github.repository',
    );
    expect(workflow.jobs.gate.env?.REQUIRED_WORKFLOWS).toBe('Test CI,E2E CI');
    expect(workflow.jobs.gate.env?.REQUIRED_CHECK_RUNS).toBe('GitGuardian Security Checks');
    expect(workflow.jobs.gate.env?.IGNORED_STATUS_CONTEXTS).toBe('Vercel');
    expect(workflow.jobs.gate.env?.GATE_TIMEOUT_MS).toBe('3600000');
    expect(workflow.jobs.gate['timeout-minutes']).toBeGreaterThanOrEqual(70);
    expect(workflow.jobs.gate.steps).toHaveLength(2);
  });

  it('starts the exact deployment only after the gate succeeds and the switch is open', () => {
    expect(workflow.jobs.deploy.needs).toBe('gate');
    expect(workflow.jobs.deploy.if).toContain("needs.gate.result == 'success'");
    expect(workflow.jobs.deploy.if).toContain("vars.VERCEL_PREVIEW_DEPLOYMENT_GATE == 'open'");
    expect(workflow.jobs.deploy.if).toContain("github.event.action != 'closed'");
    expect(workflow.jobs.deploy.steps).toHaveLength(4);
    expect(workflow.jobs.deploy.steps?.[2]).toEqual(
      expect.objectContaining({ name: 'Create exact Vercel Preview deployment' }),
    );
    expect(
      readFileSync(
        path.resolve(import.meta.dirname, '../.github/workflows/vercel-preview.yml'),
        'utf8',
      ),
    ).toContain('.state == "open" and .merged == false and .head.sha == $sha');
  });
});

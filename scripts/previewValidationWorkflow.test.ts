import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

interface WorkflowStep {
  id?: string;
  name?: string;
  run?: string;
  uses?: string;
  with?: Record<string, string>;
}

interface Workflow {
  concurrency: { group: string };
  jobs: Record<string, { if?: string; steps: WorkflowStep[] }>;
  on?: Record<string, unknown>;
}

const workflowDirectory = path.resolve(import.meta.dirname, '../.github/workflows');

describe.each([
  ['preview-smoke.yml', 'smoke'],
  ['preview-e2e.yml', 'e2e'],
])('%s manual validation', (file, jobName) => {
  const workflow = parse(readFileSync(path.join(workflowDirectory, file), 'utf8')) as Workflow;
  const steps = workflow.jobs[jobName].steps;

  it('accepts only explicitly validated workflow dispatches', () => {
    expect(workflow.on).toHaveProperty('workflow_dispatch');
    expect(workflow.on).not.toHaveProperty('deployment_status');
  });

  it('requires an explicit repository-owner trust decision before injecting secrets', () => {
    expect(workflow.jobs[jobName].if).toContain('github.actor == github.repository_owner');
    expect(workflow.jobs[jobName].if).toContain(
      'github.triggering_actor == github.repository_owner',
    );
    expect(workflow.concurrency.group).toBe('preview-validation-${{ github.repository }}');
  });

  it('passes the validated deployment ref through a step output', () => {
    const validate = steps.find((step) => step.name === 'Validate manual Preview URL');
    const resolve = steps.find((step) => step.name === 'Resolve Preview database URL');

    expect(validate?.id).toBe('validate-manual-preview');
    expect(validate?.run).toContain(`printf 'deployment-ref=%s\\n'`);
    expect(validate?.run).toContain('>> "$GITHUB_OUTPUT"');
    expect(validate?.run).toContain('deployments/${EXPECTED_DEPLOYMENT_ID}/statuses');
    expect(validate?.run).toContain('.creator.login == "vercel[bot]"');
    expect(validate?.run).toContain('.environment_url == $url');
    expect(validate?.run).not.toContain('VERCEL_TOKEN');
    expect(validate?.run).not.toContain('MANUAL_DEPLOYMENT_REF');
    expect(resolve?.with?.['deployment-ref']).toBe(
      '${{ steps.validate-manual-preview.outputs.deployment-ref }}',
    );
  });

  it('resolves the deployment branch rather than the workflow dispatch branch', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'preview-ref-test-'));
    const url = 'https://orvilo1-abcdef-alexs-projects-078b8b0b.vercel.app';
    const sha = 'a'.repeat(40);
    try {
      const curl = path.join(directory, 'curl');
      const statuses = [{
        created_at: '2026-09-17',
        creator: { login: 'vercel[bot]' },
        environment: 'Preview',
        environment_url: url,
        state: 'success',
        target_url: url,
      }];
      const deployment = {
        creator: { login: 'vercel[bot]' },
        environment: 'Preview',
        ref: 'feat/deployment-branch',
        sha,
      };
      writeFileSync(curl, `#!/usr/bin/env bash
case "$*" in
  *statuses*) echo '${JSON.stringify(statuses)}' ;;
  *) echo '${JSON.stringify(deployment)}' ;;
esac
`);
      chmodSync(curl, 0o755);
      const output = path.join(directory, 'output');
      const result = spawnSync(
        'bash',
        ['-c', steps.find((step) => step.id === 'validate-manual-preview')!.run!],
        {
          env: {
            ...process.env,
            BASE_URL: url,
            EXPECTED_DEPLOYMENT_ID: '123',
            EXPECTED_SHA: sha,
            GITHUB_API_URL: 'https://github.invalid',
            GITHUB_ENV: path.join(directory, 'env'),
            GITHUB_OUTPUT: output,
            GITHUB_REF_NAME: 'main',
            GITHUB_REPOSITORY: 'owner/repo',
            GITHUB_TOKEN: 'fixture',
            PATH: `${directory}:${process.env.PATH}`,
          },
          timeout: 15_000,
        },
      );
      expect(result.stderr.toString()).toBe('');
      expect(result.status).toBe(0);
      expect(readFileSync(output, 'utf8')).toBe('deployment-ref=feat/deployment-branch\n');
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });

  it('loads current validation helpers before checking out the deployment source', () => {
    const validationCheckoutIndex = steps.findIndex(
      (step) => step.name === 'Checkout validation workflow',
    );
    const resolveIndex = steps.findIndex((step) => step.name === 'Resolve Preview database URL');
    const deploymentCheckoutIndex = steps.findIndex(
      (step) => step.name === 'Checkout deployment source',
    );

    expect(validationCheckoutIndex).toBeGreaterThan(-1);
    expect(resolveIndex).toBeGreaterThan(validationCheckoutIndex);
    expect(deploymentCheckoutIndex).toBeGreaterThan(resolveIndex);
    expect(steps[validationCheckoutIndex].with?.ref).toBe('${{ github.sha }}');
    expect(steps[deploymentCheckoutIndex].with?.ref).toBe('${{ inputs.deployment_sha }}');
  });
});

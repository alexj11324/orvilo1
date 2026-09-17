import { readFileSync } from 'node:fs';
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
  jobs: Record<string, { steps: WorkflowStep[] }>;
}

const workflowDirectory = path.resolve(import.meta.dirname, '../.github/workflows');

describe.each([
  ['preview-smoke.yml', 'smoke'],
  ['preview-e2e.yml', 'e2e'],
])('%s manual validation', (file, jobName) => {
  const workflow = parse(readFileSync(path.join(workflowDirectory, file), 'utf8')) as Workflow;
  const steps = workflow.jobs[jobName].steps;

  it('passes the validated deployment ref through a step output', () => {
    const validate = steps.find((step) => step.name === 'Validate manual Preview URL');
    const resolve = steps.find((step) => step.name === 'Resolve Preview database URL');

    expect(validate?.id).toBe('validate-manual-preview');
    expect(validate?.run).toContain(`printf 'deployment-ref=%s\\n'`);
    expect(validate?.run).toContain('>> "$GITHUB_OUTPUT"');
    expect(validate?.run).not.toContain('MANUAL_DEPLOYMENT_REF');
    expect(resolve?.with?.['deployment-ref']).toBe(
      "${{ github.event.deployment.ref || steps.validate-manual-preview.outputs.deployment-ref || '' }}",
    );
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
    expect(steps[validationCheckoutIndex].with?.ref).toBe(
      "${{ github.event_name == 'workflow_dispatch' && github.sha || github.event.deployment.sha || github.sha }}",
    );
    expect(steps[deploymentCheckoutIndex].with?.ref).toBe(
      '${{ inputs.deployment_sha || github.event.deployment.sha || github.sha }}',
    );
  });
});

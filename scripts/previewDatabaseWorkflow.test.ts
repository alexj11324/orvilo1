import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

interface WorkflowStep {
  name?: string;
  run?: string;
}

interface Workflow {
  jobs: Record<string, { env?: Record<string, string>; steps: WorkflowStep[] }>;
}

const provisionWorkflow = parse(
  readFileSync(path.resolve(import.meta.dirname, '../.github/workflows/preview-db.yml'), 'utf8'),
) as Workflow;
const cleanupWorkflow = parse(
  readFileSync(
    path.resolve(import.meta.dirname, '../.github/workflows/preview-cleanup.yml'),
    'utf8',
  ),
) as Workflow;

describe('Preview database workflow', () => {
  it('extracts grant log metadata in a fail-closed command', () => {
    const grant = provisionWorkflow.jobs.provision.steps.find(
      (step) => step.name === 'Grant app database privileges',
    );

    expect(grant?.run).toContain('PR_DB_HOST=$(DATABASE_URL="$PR_ADMIN_URL" node -e');
    expect(grant?.run).toContain('host=$PR_DB_HOST database=$DB_NAME');
    expect(grant?.run).not.toContain('process.env.PR_ADMIN_URL');
  });

  it('uses a distinct app role for every provisioning attempt', () => {
    const provision = provisionWorkflow.jobs.provision;
    const prepare = provision.steps.find(
      (step) => step.name === 'Provision database and rotate per-PR roles',
    );

    expect(provision.env?.APP_ROLE).toBe(
      'orvilo_pr_${{ github.event.pull_request.number }}_app_${{ github.run_id }}_${{ github.run_attempt }}',
    );
    expect(prepare?.run).toContain('^orvilo_pr_[0-9]+_app_[0-9]+_[0-9]+$');
  });

  it('drops legacy and versioned app roles when the PR closes', () => {
    const cleanup = cleanupWorkflow.jobs.teardown;
    const drop = cleanup.steps.find((step) => step.name === 'Drop database and per-PR roles');

    expect(cleanup.env?.APP_ROLE_PREFIX).toBe(
      'orvilo_pr_${{ github.event.pull_request.number }}_app',
    );
    expect(drop?.run).toContain("strpos(rolname, :'app_role_prefix' || '_') = 1");
    expect(drop?.run).toContain('^orvilo_pr_[0-9]+_app(_[0-9]+_[0-9]+)?$');
    expect(drop?.run).toContain("DROP ROLE IF EXISTS %I', :'app_role'");
  });
});

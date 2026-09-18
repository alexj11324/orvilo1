import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

interface WorkflowStep {
  env?: Record<string, string>;
  name?: string;
  run?: string;
  uses?: string;
}

interface Workflow {
  jobs: Record<
    string,
    {
      'if'?: string;
      'env'?: Record<string, string>;
      'steps': WorkflowStep[];
      'timeout-minutes'?: number;
    }
  >;
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
  it('checks exact-head CI and Vercel access before opening the Oracle tunnel', () => {
    expect(provisionWorkflow.jobs.provision.if).toContain('VERCEL_PREVIEW_DEPLOYMENT_GATE');
    const gateIndex = provisionWorkflow.jobs.provision.steps.findIndex(
      (step) => step.name === 'Validate exact-head CI, Vercel access, and manual deployment gate',
    );
    const tunnelIndex = provisionWorkflow.jobs.provision.steps.findIndex(
      (step) => step.name === 'Open trusted Preview database tunnel',
    );
    const gate = provisionWorkflow.jobs.provision.steps[gateIndex];

    const checkoutIndex = provisionWorkflow.jobs.provision.steps.findIndex(
      (step) =>
        step.name === 'Checkout preflight helpers' && step.uses?.startsWith('actions/checkout@'),
    );
    expect(checkoutIndex).toBeGreaterThanOrEqual(0);
    expect(checkoutIndex).toBeLessThan(gateIndex);
    expect(gateIndex).toBeLessThan(tunnelIndex);
    expect(gate?.run).toContain('VERCEL_PREVIEW_DEPLOYMENT_GATE');
    expect(gate?.run).toContain('vercelPreviewGate.mjs');
    expect(gate?.run).not.toContain('checkGitHubWorkflowGate.mjs');
    expect(gate?.run).toContain('api.vercel.com/v9/projects/${VERCEL_PROJECT_ID}/env');
    expect(gate?.env?.REQUIRED_WORKFLOWS).toBe('Test CI,E2E CI');
    expect(gate?.env?.IGNORED_CHECK_RUNS).toContain('Provision per-PR database');
    expect(gate?.env?.GATE_TIMEOUT_MS).toBe('2400000');
    expect(provisionWorkflow.jobs.provision['timeout-minutes']).toBe(45);
  });

  it('extracts grant log metadata in a fail-closed command', () => {
    const grant = provisionWorkflow.jobs.provision.steps.find(
      (step) => step.name === 'Grant app database privileges',
    );

    expect(grant?.run).toContain('PR_DB_HOST=$(DATABASE_URL="$PR_ADMIN_URL" node -e');
    expect(grant?.run).toContain('ADMIN_URL="$ADMIN_URL" DB_NAME="$DB_NAME" node <<');
    expect(grant?.run).toContain('host=$PR_DB_HOST database=$DB_NAME');
    expect(grant?.run).not.toContain('process.env.PR_ADMIN_URL');
  });

  it('probes the deployed app role through its own restricted connection', () => {
    const grant = provisionWorkflow.jobs.provision.steps.find(
      (step) => step.name === 'Grant app database privileges',
    );

    expect(grant?.run).toContain('role_probe=$(psql "$APP_PROBE_URL"');
    expect(grant?.run).toContain("has_schema_privilege(current_user, 'public', 'CREATE')");
    expect(grant?.run).toContain(
      "has_database_privilege(current_user, current_database(), 'CREATE')",
    );
    expect(grant?.run).toContain('probe_database" != "$DB_NAME"');
    expect(grant?.run).toContain('probe_role" != "$APP_ROLE"');
    expect(grant?.run).toContain('unexpected elevated privilege');
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

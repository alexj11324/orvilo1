import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

interface WorkflowStep {
  name?: string;
  run?: string;
}

interface Workflow {
  jobs: Record<string, { steps: WorkflowStep[] }>;
}

const workflow = parse(
  readFileSync(path.resolve(import.meta.dirname, '../.github/workflows/preview-db.yml'), 'utf8'),
) as Workflow;

describe('Preview database workflow', () => {
  it('extracts grant log metadata in a fail-closed command', () => {
    const grant = workflow.jobs.provision.steps.find(
      (step) => step.name === 'Grant app database privileges',
    );

    expect(grant?.run).toContain('PR_DB_HOST=$(DATABASE_URL="$PR_ADMIN_URL" node -e');
    expect(grant?.run).toContain('host=$PR_DB_HOST database=$DB_NAME');
    expect(grant?.run).not.toContain('process.env.PR_ADMIN_URL');
  });
});

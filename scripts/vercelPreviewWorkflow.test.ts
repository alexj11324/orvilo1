import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const readWorkflow = (filename: string) =>
  parse(readFileSync(path.resolve(import.meta.dirname, '../.github/workflows', filename), 'utf8'));

describe('event-driven CI ownership and deployment contracts', () => {
  it('preserves PostgreSQL test configuration when disabling coverage', () => {
    const step = readWorkflow('test.yml').jobs['test-database'].steps.find(
      (step: { name?: string }) => step.name === 'Test Coverage',
    );
    expect(step.run).toContain('--config vitest.config.server.mts');
  });

  it('uses cumulative UI selection instead of last-push path filtering', () => {
    const workflow = readWorkflow('ui-alignment.yml');
    expect(workflow.on.push.paths).toBeUndefined();
    expect(workflow.jobs.changes.steps[0].with['fetch-depth']).toBe(0);
    expect(workflow.jobs.alignment.needs).toBe('changes');
    expect(workflow.jobs.alignment.if).toContain("needs.changes.outputs.ui == 'true'");
    expect(workflow.jobs.alignment.name).toContain('Push owns browser geometry');
  });

  it('executes the real quality gate and rejects accidental skips and broken plans', () => {
    const workflow = readWorkflow('test.yml');
    const gate = workflow.jobs['required-quality-gate'];
    const needs: Record<string, { result: string; outputs?: Record<string, string> }> = {};
    for (const name of gate.needs) needs[name] = { result: 'success' };
    needs.changes.outputs = { coverage: 'false' };
    needs['merge-app-coverage'].result = 'skipped';
    needs['merge-server-coverage'].result = 'skipped';
    const run = () =>
      spawnSync('bash', ['-c', gate.steps[0].run], {
        env: { ...process.env, NEEDS: JSON.stringify(needs) },
        encoding: 'utf8',
      });
    expect(run().status).toBe(0);
    needs.typecheck.result = 'skipped';
    expect(run().status).toBe(1);
    needs.changes.outputs.typecheck = 'false';
    expect(run().status).toBe(0);
    needs.changes.result = 'failure';
    expect(run().status).toBe(1);
    needs.changes.result = 'success';
    needs.changes.outputs.coverage = 'true';
    needs.changes.outputs.app = 'true';
    needs.changes.outputs.server = 'true';
    expect(run().status).toBe(1);
  });
  it('keeps the head push as the quality gate owner without a skipped merge-SHA gate', () => {
    const workflow = readWorkflow('test.yml');
    const gate = workflow.jobs['required-quality-gate'];
    expect(gate.name).toContain('Push owns quality checks');
    expect(gate.name).toContain('Required Quality Gate');
    expect(gate.if).toContain('head.repo.full_name != github.repository');
    expect(workflow.jobs.changes.if).toContain('head.repo.full_name != github.repository');
    expect(gate.steps[0].run).not.toContain('sleep');
  });

  it('keeps canonical E2E push verification running', () => {
    const step = readWorkflow('e2e.yml').jobs['check-duplicate-run'].steps[0];
    expect(JSON.parse(step.with.do_not_skip)).toContain('push');
    expect(step.with.cancel_others).toBe('false');
  });

  it.each(['vercel-preview.yml', 'vercel-branch-deploy.yml'])(
    '%s cannot deploy before a single-pass exact-head gate passes',
    (filename) => {
      const workflow = readWorkflow(filename);
      expect(workflow.on.workflow_run.types).toContain('completed');
      expect(workflow.on.workflow_run.workflows).toEqual(
        expect.arrayContaining(['Test CI', 'E2E CI', 'UI alignment', 'Verify Auth']),
      );
      expect(workflow.on.workflow_run.workflows).not.toContain(workflow.name);
      expect(workflow.on.check_run.types).toContain('completed');
      expect(workflow.on).toHaveProperty('status');
      const deploy = workflow.jobs.deploy;
      expect(deploy.env.REQUIRED_WORKFLOWS).toBe('Test CI,E2E CI');
      expect(deploy.env.REQUIRED_CHECK_RUNS).toBe('GitGuardian Security Checks');
      expect(deploy.env.GATE_SINGLE_PASS).toBe('true');
      expect(deploy.env.HEAD_SHA).toBe('${{ matrix.sha }}');
      expect(deploy.steps[0].with.ref).toBe('${{ github.event.repository.default_branch }}');
      expect(deploy.steps[0].with['persist-credentials']).toBe(false);
      expect(deploy.concurrency['cancel-in-progress']).toBe(false);
      const create = deploy.steps.find((step: { id?: string }) => step.id === 'deploy');
      expect(create.if).toContain("steps.gate.outputs.ready == 'true'");
      expect(create.if).toContain("steps.existing.outputs.exists != 'true'");
      expect(create.run).toContain('.gitSource.sha == $sha');
      expect(create.run).toContain(
        filename === 'vercel-preview.yml' ? '.head.sha == $sha' : '.object.sha == $sha',
      );
    },
  );

  it('retains the preview quota circuit breaker', () => {
    expect(readWorkflow('vercel-preview.yml').jobs.deploy.if).toContain(
      "vars.VERCEL_PREVIEW_DEPLOYMENT_GATE == 'open'",
    );
  });

  it('only merges coverage on protected pushes and includes merges in the gate', () => {
    const workflow = readWorkflow('test.yml');
    for (const area of ['app', 'server']) {
      expect(workflow.jobs[`merge-${area}-coverage`].if).toContain(
        "needs.changes.outputs.coverage == 'true'",
      );
      expect(workflow.jobs['required-quality-gate'].needs).toContain(`merge-${area}-coverage`);
    }
  });
});

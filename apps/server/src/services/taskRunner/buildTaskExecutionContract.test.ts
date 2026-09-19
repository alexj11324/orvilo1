import { describe, expect, it } from 'vitest';

import { buildTaskExecutionContract } from './buildTaskExecutionContract';

const task = {
  totalTopics: 2,
} as Parameters<typeof buildTaskExecutionContract>[0];

const baseInput = {
  acceptanceEnabled: true,
  dispatch: {
    generation: 4,
    planRevision: 2,
    policyRevision: 7,
    requirementRevision: 9,
    taskRevision: 11,
  },
  environment: {
    branch: 'task/T-1',
    repo: 'acme/widget',
    workingDirectory: '/tmp/worktree',
  },
  tools: ['task'],
};

describe('buildTaskExecutionContract', () => {
  it('freezes versions, tools, acceptance and environment into schema v1', () => {
    const contract = buildTaskExecutionContract(task, baseInput);

    expect(contract).toMatchObject({
      acceptance: { enabled: true },
      environment: {
        branch: 'task/T-1',
        repo: 'acme/widget',
        workingDirectory: '/tmp/worktree',
      },
      schemaVersion: 1,
      tools: ['task'],
      versions: {
        executionGeneration: 4,
        planRevision: 2,
        policyRevision: 7,
        requirementRevision: 9,
        taskRevision: 11,
      },
    });
    expect(contract.delegation).toBeUndefined();
    expect(contract.integration).toBeUndefined();
  });

  it('derives round from totalTopics when no goal loop is active', () => {
    const contract = buildTaskExecutionContract(task, baseInput);
    expect(contract.budget).toEqual({ maxRounds: null, round: 3 });
  });

  it('binds the goal-loop budget the prompt rendered', () => {
    const contract = buildTaskExecutionContract(task, {
      ...baseInput,
      goalLoop: { maxRounds: 5, round: 3 },
    });
    expect(contract.budget).toEqual({ maxRounds: 5, round: 3 });
  });

  it('carries the delegation grant and integration pinning when present', () => {
    const contract = buildTaskExecutionContract(task, {
      ...baseInput,
      grantId: 'grant-1',
      integration: {
        baseBranch: 'main',
        branch: 'task/T-1',
        expectedBaseSha: 'abc',
        expectedHeadSha: 'def',
        repo: 'acme/widget',
      },
    });

    expect(contract.delegation).toEqual({ grantId: 'grant-1' });
    expect(contract.integration).toEqual({
      baseBranch: 'main',
      branch: 'task/T-1',
      expectedBaseSha: 'abc',
      expectedHeadSha: 'def',
      repo: 'acme/widget',
    });
  });

  it('copies the tool list so later mutation cannot widen the contract', () => {
    const tools = ['task'];
    const contract = buildTaskExecutionContract(task, { ...baseInput, tools });
    tools.push('extra-tool');
    expect(contract.tools).toEqual(['task']);
  });
});

import { describe, expect, it } from 'vitest';

import { projectIssueProgress, projectIssueProgressPercent } from './projectIssueProgress';

describe('project issue progress', () => {
  it('counts workflow scope, started work and completion independently of goals or execution', () => {
    expect(
      projectIssueProgress([
        { workflowCategory: 'triage' },
        { workflowCategory: 'backlog' },
        { workflowCategory: 'todo' },
        { workflowCategory: 'in_progress' },
        { workflowCategory: 'in_review' },
        { workflowCategory: 'done' },
        { workflowCategory: 'canceled' },
      ]),
    ).toEqual({ scope: 6, started: 2, completed: 1 });
  });

  it('distinguishes an unavailable issue list from a successfully loaded empty project', () => {
    expect(projectIssueProgress(undefined)).toBeNull();
    expect(projectIssueProgress(null)).toBeNull();
    expect(projectIssueProgress([])).toEqual({ scope: 0, started: 0, completed: 0 });
  });

  it('derives the status-ring percent from completed over scope', () => {
    expect(
      projectIssueProgressPercent([
        { workflowCategory: 'done' },
        { workflowCategory: 'todo' },
        { workflowCategory: 'canceled' },
      ]),
    ).toBe(50);
    expect(projectIssueProgressPercent([])).toBe(0);
    expect(projectIssueProgressPercent(undefined)).toBeNull();
  });
});

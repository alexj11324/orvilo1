import type { TaskItem } from '@orvilo/types';
import { describe, expect, it } from 'vitest';

import { snapshotAutomationDefinition } from './automationOccurrence';

describe('automation definition version', () => {
  it('pins content and revisions while ignoring execution generation', () => {
    const task = {
      id: 'a',
      instruction: 'Report',
      assigneeAgentId: 'agent',
      config: { a: 1, b: 2 },
      policyRevision: 1,
      requirementRevision: 1,
    } as unknown as TaskItem;
    const old = snapshotAutomationDefinition(task);
    expect(
      snapshotAutomationDefinition({ ...task, executionGeneration: 20, config: { b: 2, a: 1 } })
        .definitionVersionId,
    ).toBe(old.definitionVersionId);
    expect(
      snapshotAutomationDefinition({ ...task, instruction: 'Report and update' })
        .definitionVersionId,
    ).not.toBe(old.definitionVersionId);
    expect(old.instruction).toBe('Report');
  });
});

import type { TaskDetailSubtask } from '@orvilo/types';
import { describe, expect, it } from 'vitest';

import { sortSubtasksByStatus } from './subtaskOrdering';

const subtask = (
  partial: Partial<TaskDetailSubtask> & { identifier: string },
): TaskDetailSubtask => ({
  status: 'backlog',
  ...partial,
});

const identifiers = (tasks: readonly TaskDetailSubtask[]) => tasks.map((t) => t.identifier);

describe('sortSubtasksByStatus', () => {
  it('orders rows by Issue-board column order', () => {
    const sorted = sortSubtasksByStatus([
      subtask({ identifier: 'T-done', workflowCategory: 'done' }),
      subtask({ identifier: 'T-todo', workflowCategory: 'todo' }),
      subtask({ identifier: 'T-review', workflowCategory: 'in_review' }),
      subtask({ identifier: 'T-backlog', workflowCategory: 'backlog' }),
      subtask({ identifier: 'T-progress', workflowCategory: 'in_progress' }),
      subtask({ identifier: 'T-canceled', workflowCategory: 'canceled' }),
      subtask({ identifier: 'T-triage', workflowCategory: 'triage' }),
    ]);

    expect(identifiers(sorted)).toEqual([
      'T-triage',
      'T-backlog',
      'T-todo',
      'T-progress',
      'T-review',
      'T-done',
      'T-canceled',
    ]);
  });

  it('keeps incoming order inside one status bucket', () => {
    const sorted = sortSubtasksByStatus([
      subtask({ identifier: 'T-b-1', workflowCategory: 'backlog' }),
      subtask({ identifier: 'T-done', workflowCategory: 'done' }),
      subtask({ identifier: 'T-b-2', workflowCategory: 'backlog' }),
    ]);

    expect(identifiers(sorted)).toEqual(['T-b-1', 'T-b-2', 'T-done']);
  });

  it('buckets a missing workflowCategory as backlog, matching the status picker', () => {
    const sorted = sortSubtasksByStatus([
      subtask({ identifier: 'T-todo', workflowCategory: 'todo' }),
      subtask({ identifier: 'T-legacy' }),
    ]);

    expect(identifiers(sorted)).toEqual(['T-legacy', 'T-todo']);
  });

  it('sorts every level of the tree independently', () => {
    const sorted = sortSubtasksByStatus([
      subtask({
        children: [
          subtask({ identifier: 'T-1-done', workflowCategory: 'done' }),
          subtask({ identifier: 'T-1-todo', workflowCategory: 'todo' }),
        ],
        identifier: 'T-1',
        workflowCategory: 'done',
      }),
      subtask({ identifier: 'T-2', workflowCategory: 'backlog' }),
    ]);

    expect(identifiers(sorted)).toEqual(['T-2', 'T-1']);
    expect(identifiers(sorted[1].children!)).toEqual(['T-1-todo', 'T-1-done']);
  });

  it('does not mutate the input array or its tasks', () => {
    const child = subtask({ identifier: 'T-1-done', workflowCategory: 'done' });
    const parent = subtask({ children: [child], identifier: 'T-1', workflowCategory: 'done' });
    const input = [parent, subtask({ identifier: 'T-2', workflowCategory: 'backlog' })];

    const sorted = sortSubtasksByStatus(input);

    expect(identifiers(input)).toEqual(['T-1', 'T-2']);
    expect(sorted[0]).toBe(input[1]); // childless rows keep object identity
    expect(sorted[1]).not.toBe(parent); // a resorted children array lands on a copy
    expect(sorted[1].children?.[0]).toBe(child);
  });
});

import type { TaskDetailSubtask } from '@orvilo/types';
import { describe, expect, it } from 'vitest';

import { countSubtaskProgress } from './subtaskProgress';

const subtask = (
  partial: Partial<TaskDetailSubtask> & { identifier: string },
): TaskDetailSubtask => ({
  status: 'backlog',
  ...partial,
});

describe('countSubtaskProgress', () => {
  it('returns 0/0 for an empty tree', () => {
    expect(countSubtaskProgress([])).toEqual({ completed: 0, total: 0 });
  });

  it('counts only workflow-done subtasks toward the numerator', () => {
    const progress = countSubtaskProgress([
      subtask({ identifier: 'T-1', workflowCategory: 'done' }),
      subtask({ identifier: 'T-2', workflowCategory: 'in_progress' }),
      subtask({ identifier: 'T-3', workflowCategory: 'canceled' }),
      subtask({ identifier: 'T-4', workflowCategory: 'done' }),
    ]);

    // Canceled is terminal but not "done" — same rule as the server SQL.
    expect(progress).toEqual({ completed: 2, total: 4 });
  });

  it('counts descendants at every depth, not just top-level rows', () => {
    const progress = countSubtaskProgress([
      subtask({
        children: [
          subtask({ identifier: 'T-1-1', workflowCategory: 'done' }),
          subtask({
            children: [subtask({ identifier: 'T-1-2-1', workflowCategory: 'done' })],
            identifier: 'T-1-2',
            workflowCategory: 'todo',
          }),
        ],
        identifier: 'T-1',
        workflowCategory: 'backlog',
      }),
    ]);

    expect(progress).toEqual({ completed: 2, total: 4 });
  });

  it('falls back to the legacy completed status when the category was never projected', () => {
    const progress = countSubtaskProgress([
      subtask({ identifier: 'T-1', status: 'completed' }),
      subtask({ identifier: 'T-2', status: 'completed', workflowCategory: 'in_progress' }),
    ]);

    // T-2's projected category wins over its stale legacy status.
    expect(progress).toEqual({ completed: 1, total: 2 });
  });
});

import type { TaskDetailSubtask } from '@orvilo/types';
import { describe, expect, it } from 'vitest';

import { sortSubtasks, sortSubtasksByStatus } from './subtaskOrdering';

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

describe('sortSubtasks', () => {
  it('keeps the server order for manual and returns a copy', () => {
    const input = [
      subtask({ identifier: 'T-2', workflowCategory: 'done' }),
      subtask({ identifier: 'T-1', workflowCategory: 'backlog' }),
    ];

    const sorted = sortSubtasks(input, 'manual');

    expect(identifiers(sorted)).toEqual(['T-2', 'T-1']);
    expect(sorted).not.toBe(input);
  });

  it('matches sortSubtasksByStatus for the status ordering', () => {
    const input = [
      subtask({ identifier: 'T-done', workflowCategory: 'done' }),
      subtask({ identifier: 'T-backlog', workflowCategory: 'backlog' }),
    ];

    expect(identifiers(sortSubtasks(input, 'status'))).toEqual(
      identifiers(sortSubtasksByStatus(input)),
    );
  });

  it('orders by priority urgent-first with no-priority last', () => {
    const sorted = sortSubtasks(
      [
        subtask({ identifier: 'T-low', priority: 4 }),
        subtask({ identifier: 'T-none', priority: 0 }),
        subtask({ identifier: 'T-urgent', priority: 1 }),
        subtask({ identifier: 'T-normal', priority: 3 }),
        subtask({ identifier: 'T-high', priority: 2 }),
        subtask({ identifier: 'T-missing' }),
      ],
      'priority',
    );

    expect(identifiers(sorted)).toEqual([
      'T-urgent',
      'T-high',
      'T-normal',
      'T-low',
      'T-none',
      'T-missing',
    ]);
  });

  it('orders by updatedAt newest-first, missing timestamps last', () => {
    const sorted = sortSubtasks(
      [
        subtask({ identifier: 'T-old', updatedAt: '2024-01-01T00:00:00Z' }),
        subtask({ identifier: 'T-none' }),
        subtask({ identifier: 'T-new', updatedAt: '2024-03-01T00:00:00Z' }),
        subtask({ identifier: 'T-mid', updatedAt: '2024-02-01T00:00:00Z' }),
      ],
      'updatedAt',
    );

    expect(identifiers(sorted)).toEqual(['T-new', 'T-mid', 'T-old', 'T-none']);
  });

  it('sorts nested levels by the picked ordering too', () => {
    const sorted = sortSubtasks(
      [
        subtask({
          children: [
            subtask({ identifier: 'T-1-low', priority: 4 }),
            subtask({ identifier: 'T-1-urgent', priority: 1 }),
          ],
          identifier: 'T-1',
          priority: 4,
        }),
        subtask({ identifier: 'T-2', priority: 1 }),
      ],
      'priority',
    );

    expect(identifiers(sorted)).toEqual(['T-2', 'T-1']);
    expect(identifiers(sorted[1].children!)).toEqual(['T-1-urgent', 'T-1-low']);
  });
});

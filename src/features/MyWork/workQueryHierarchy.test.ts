import { describe, expect, it } from 'vitest';

import { workQueryHierarchyRows } from './workQueryHierarchy';
import type { WorkQueryResultTask } from './workQueryPaging';

const task = (id: string, parentTaskId?: string): WorkQueryResultTask =>
  ({ id, identifier: id.toUpperCase(), parentTaskId, status: 'backlog' }) as WorkQueryResultTask;

describe('workQueryHierarchyRows', () => {
  it('puts visible parents before nested children even when query order is child-first', () => {
    const tasks = [task('grandchild', 'child'), task('child', 'parent'), task('parent')];
    const rows = workQueryHierarchyRows(tasks, tasks);

    expect(rows.map(({ depth, task: rowTask }) => [rowTask.id, depth])).toEqual([
      ['parent', 0],
      ['child', 1],
      ['grandchild', 2],
    ]);
  });

  it('adds a muted parent context when the child belongs to a different group', () => {
    const parent = task('parent');
    const child = task('child', 'parent');
    const rows = workQueryHierarchyRows([child], [child, parent]);

    expect(
      rows.map(({ depth, isParentContext, task: rowTask }) => ({
        depth,
        id: rowTask.id,
        isParentContext,
      })),
    ).toEqual([
      { depth: 0, id: 'parent', isParentContext: true },
      { depth: 1, id: 'child', isParentContext: false },
    ]);
  });
});

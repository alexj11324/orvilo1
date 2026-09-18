import type { MyWorkMode, WorkQuery, WorkQueryLayout } from '@orvilo/types';

/** Built-in My Work lists that have a WorkQuery AST. Subscribed is mode-injected. */
export const MY_WORK_SAVEABLE_MODES = ['assigned', 'created', 'delegated', 'review'] as const;

export type MyWorkSaveableMode = (typeof MY_WORK_SAVEABLE_MODES)[number];

export const isMyWorkSaveableMode = (mode: MyWorkMode): mode is MyWorkSaveableMode =>
  (MY_WORK_SAVEABLE_MODES as readonly string[]).includes(mode);

/** Keep in sync with `myWorkQueryForMode` for these four modes. */
export const myWorkSaveAsQuery = (
  mode: MyWorkSaveableMode,
  layout: WorkQueryLayout = 'list',
): WorkQuery => {
  const current = { ref: 'currentUser' as const };
  const board =
    layout === 'board' ? { groupBy: 'workflowCategory' as const, layout: 'board' as const } : {};
  switch (mode) {
    case 'assigned': {
      return {
        entityType: 'task',
        filter: { all: [{ field: 'assigneeUserId', op: 'eq', value: current }] },
        schemaVersion: 1,
        sort: [
          { direction: 'desc', field: 'updatedAt' },
          { direction: 'asc', field: 'id' },
        ],
        ...board,
      };
    }
    case 'created': {
      return {
        entityType: 'task',
        filter: { all: [{ field: 'createdByUserId', op: 'eq', value: current }] },
        schemaVersion: 1,
        ...board,
      };
    }
    case 'delegated': {
      return {
        entityType: 'task',
        filter: { all: [{ field: 'delegatedByUserId', op: 'eq', value: current }] },
        schemaVersion: 1,
        ...board,
      };
    }
    case 'review': {
      return {
        entityType: 'task',
        filter: { all: [{ field: 'reviewerUserId', op: 'eq', value: current }] },
        schemaVersion: 1,
        ...board,
      };
    }
  }
};

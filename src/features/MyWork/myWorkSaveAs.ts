import type { MyWorkMode, WorkQuery, WorkQueryLayout } from '@orvilo/types';

/**
 * My issues tabs whose WorkQuery AST is self-contained. `subscribed` and
 * `activity` resolve through mode-injected EXISTS clauses server-side, so
 * saving them as a bare query would silently change their semantics.
 */
export const MY_WORK_SAVEABLE_MODES = ['assigned', 'created'] as const;

export type MyWorkSaveableMode = (typeof MY_WORK_SAVEABLE_MODES)[number];

export const isMyWorkSaveableMode = (mode: MyWorkMode): mode is MyWorkSaveableMode =>
  (MY_WORK_SAVEABLE_MODES as readonly string[]).includes(mode);

/** Keep in sync with `myWorkQueryForMode` for these two modes. */
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
  }
};

import type { MyWorkMode, WorkQuery, WorkQueryLayout } from '@orvilo/types';

/**
 * My issues tabs whose WorkQuery AST is self-contained. Subscribed and
 * activity carry their EXISTS predicate (`subscribed` / `hasActivity` =
 * currentUser), so a saved view keeps the tab's membership. Activity sort
 * still needs the query `mode` when the list should follow notification time.
 */
export const MY_WORK_SAVEABLE_MODES = ['activity', 'assigned', 'created', 'subscribed'] as const;

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
        sort: [
          { direction: 'desc', field: 'createdAt' },
          { direction: 'asc', field: 'id' },
        ],
        ...board,
      };
    }
    case 'subscribed': {
      return {
        entityType: 'task',
        filter: { all: [{ field: 'subscribed', op: 'eq', value: current }] },
        schemaVersion: 1,
        ...board,
      };
    }
    case 'activity': {
      return {
        entityType: 'task',
        filter: { all: [{ field: 'hasActivity', op: 'eq', value: current }] },
        schemaVersion: 1,
        sort: [
          { direction: 'desc', field: 'updatedAt' },
          { direction: 'asc', field: 'id' },
        ],
        ...board,
      };
    }
  }
};

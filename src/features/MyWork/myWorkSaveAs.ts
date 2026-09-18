import type { MyWorkMode, WorkQuery } from '@orvilo/types';

/** Built-in My Work lists that have a WorkQuery AST. Subscribed is mode-injected. */
export const MY_WORK_SAVEABLE_MODES = ['assigned', 'created', 'delegated', 'review'] as const;

export type MyWorkSaveableMode = (typeof MY_WORK_SAVEABLE_MODES)[number];

export const isMyWorkSaveableMode = (mode: MyWorkMode): mode is MyWorkSaveableMode =>
  (MY_WORK_SAVEABLE_MODES as readonly string[]).includes(mode);

/** Keep in sync with `myWorkQueryForMode` for these four modes. */
export const myWorkSaveAsQuery = (mode: MyWorkSaveableMode): WorkQuery => {
  const current = { ref: 'currentUser' as const };
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
      };
    }
    case 'created': {
      return {
        entityType: 'task',
        filter: { all: [{ field: 'createdByUserId', op: 'eq', value: current }] },
        schemaVersion: 1,
      };
    }
    case 'delegated': {
      return {
        entityType: 'task',
        filter: { all: [{ field: 'delegatedByUserId', op: 'eq', value: current }] },
        schemaVersion: 1,
      };
    }
    case 'review': {
      return {
        entityType: 'task',
        filter: { all: [{ field: 'reviewerUserId', op: 'eq', value: current }] },
        schemaVersion: 1,
      };
    }
  }
};

import {
  BUILTIN_SAVED_VIEW_KEYS,
  builtinSavedViewId,
  type BuiltinSavedViewKey,
  type WorkQuery,
} from '@orvilo/types';

import type { SavedViewItem } from '../schemas/workAttention';

const CURRENT_USER = { ref: 'currentUser' as const };
const STAMP = new Date('2026-01-01T00:00:00.000Z');
/** Virtual owner — never matches a visitor, so builtins are not editable. */
export const BUILTIN_SAVED_VIEW_OWNER = 'system';

const QUERY: Record<BuiltinSavedViewKey, WorkQuery> = {
  'all': { entityType: 'task', schemaVersion: 1 },
  'blocked': {
    entityType: 'task',
    filter: { all: [{ field: 'status', op: 'in', value: ['failed', 'paused'] }] },
    schemaVersion: 1,
  },
  'in-progress': {
    entityType: 'task',
    filter: { all: [{ field: 'status', op: 'eq', value: 'running' }] },
    schemaVersion: 1,
  },
  'projects': { entityType: 'project', schemaVersion: 1 },
  'review': {
    entityType: 'task',
    filter: { all: [{ field: 'reviewerUserId', op: 'eq', value: CURRENT_USER }] },
    schemaVersion: 1,
  },
};

const NAME: Record<BuiltinSavedViewKey, string> = {
  'all': 'All tasks',
  'blocked': 'Blocked',
  'in-progress': 'In progress',
  'projects': 'All projects',
  'review': 'Review',
};

export const virtualBuiltinSavedView = (
  key: BuiltinSavedViewKey,
  workspaceId?: string,
): SavedViewItem => {
  const query = QUERY[key];
  return {
    accessedAt: STAMP,
    createdAt: STAMP,
    definitionVersion: 1,
    displayOptions: {},
    entityType: query.entityType,
    id: builtinSavedViewId(key),
    layout: 'list',
    name: NAME[key],
    ownerUserId: BUILTIN_SAVED_VIEW_OWNER,
    queryAst: query,
    teamId: null,
    updatedAt: STAMP,
    visibility: 'workspace',
    workspaceId: workspaceId ?? null,
  };
};

export const listVirtualBuiltinSavedViews = (workspaceId?: string): SavedViewItem[] =>
  BUILTIN_SAVED_VIEW_KEYS.map((key) => virtualBuiltinSavedView(key, workspaceId));

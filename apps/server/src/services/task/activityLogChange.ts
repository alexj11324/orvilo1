import type {
  TaskActivityIssueRef,
  TaskActivityLogPayload,
  TaskActivityLogType,
  TaskActivityWorkflowValue,
  TaskAutomationSnapshot,
  TaskDetailPropertyChange,
  TaskStatus,
  TaskWorkflowCategory,
} from '@orvilo/types';

interface ActivityLogRow {
  payload: TaskActivityLogPayload | null;
  type: TaskActivityLogType;
}

/** Another Issue the reader is allowed to be shown, keyed by task id. */
export type ReadableIssueRefs = Map<string, { identifier: string; name?: string | null }>;

/** The activity kinds whose `fromId` / `toId` name other Issues. */
const ISSUE_REF_TYPES = new Set<TaskActivityLogType>([
  'duplicate',
  'parent',
  'relation_added',
  'relation_removed',
  'sub_issue_added',
  'sub_issue_removed',
]);

/** Task ids a set of rows refers to, for one batched, access-checked lookup. */
export const collectActivityIssueIds = (rows: ActivityLogRow[]): string[] => {
  const ids = new Set<string>();
  for (const row of rows) {
    if (!ISSUE_REF_TYPES.has(row.type)) continue;
    for (const id of [row.payload?.fromId, row.payload?.toId]) if (id) ids.add(id);
  }
  return [...ids];
};

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

/**
 * Turn one stored activity row into what the feed renders, or `null` for a
 * kind that is not a property change (the assignee slots have their own row
 * shape). Pure: every name it needs is either in the payload or in `issues`.
 *
 * An Issue id that is recorded but absent from `issues` — deleted, or outside
 * what this reader may see — becomes `{ unavailable: true }`, never `null`:
 * `null` means "there was none", and would turn "changed the parent" into
 * "removed the parent".
 */
export const activityLogPropertyChange = (
  row: ActivityLogRow,
  issues: ReadableIssueRefs,
): TaskDetailPropertyChange | null => {
  const payload = row.payload ?? {};
  const from = payload.from ?? null;
  const to = payload.to ?? null;
  const issue = (id?: string | null): TaskActivityIssueRef | null => {
    if (!id) return null;
    const found = issues.get(id);
    return found ? { identifier: found.identifier, name: found.name } : { unavailable: true };
  };
  const workflow = (category: unknown, label?: string | null): TaskActivityWorkflowValue | null =>
    typeof category === 'string'
      ? { category: category as TaskWorkflowCategory, name: label ?? null }
      : null;
  const action = row.type.endsWith('_removed') ? 'removed' : 'added';

  switch (row.type) {
    case 'status': {
      return { field: 'status', from: from as TaskStatus | null, to: to as TaskStatus };
    }
    case 'priority': {
      return { field: 'priority', from: from as number | null, to: to as number | null };
    }
    case 'automation': {
      return {
        field: 'automation',
        from: from as TaskAutomationSnapshot | null,
        to: to as TaskAutomationSnapshot | null,
      };
    }
    case 'workflow_state': {
      const target = workflow(to, payload.toLabel);
      if (!target) return null;
      return { field: 'workflow', from: workflow(from, payload.fromLabel), to: target };
    }
    case 'description': {
      return { field: 'description' };
    }
    case 'title': {
      return { field: 'title', from: text(from), to: text(to) };
    }
    case 'due_date': {
      return { field: 'dueDate', from: text(from), to: text(to) };
    }
    case 'parent': {
      return { field: 'parent', from: issue(payload.fromId), to: issue(payload.toId) };
    }
    case 'duplicate': {
      return { field: 'duplicate', from: issue(payload.fromId), to: issue(payload.toId) };
    }
    case 'relation_added':
    case 'relation_removed': {
      return {
        action,
        field: 'relation',
        relation: payload.relation ?? 'related',
        target: issue(payload.toId) ?? { unavailable: true },
      };
    }
    case 'sub_issue_added':
    case 'sub_issue_removed': {
      return {
        action,
        field: 'relation',
        relation: 'sub_issue',
        target: issue(payload.toId) ?? { unavailable: true },
      };
    }
    case 'label_added':
    case 'label_removed': {
      return { action, field: 'label', name: payload.toLabel ?? null };
    }
    case 'project':
    case 'milestone':
    case 'team': {
      // An id with no remembered name still means "there was one".
      const name = (id?: string | null, label?: string | null) => (id ? (label ?? '') : null);
      return {
        field: row.type,
        from: name(payload.fromId, payload.fromLabel),
        to: name(payload.toId, payload.toLabel),
      };
    }
    case 'resource_added':
    case 'resource_removed': {
      return {
        action,
        field: 'resource',
        kind: payload.resourceKind ?? 'link',
        title: payload.toLabel ?? null,
        url: payload.url ?? null,
      };
    }
    default: {
      return null;
    }
  }
};

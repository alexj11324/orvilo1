import type {
  LinearIssueSnapshot,
  LinearProjectBindingSettings,
  LinearSyncConflict,
  TaskItem,
} from '@orvilo/types';

import type { TaskModel } from '@/database/models/task';

export const LINEAR_SYNC_FIELDS = [
  'archivedAt',
  'assigneeId',
  'description',
  'labelIds',
  'parentId',
  'priority',
  'projectId',
  'stateId',
  'stateType',
  'teamId',
  'title',
  'url',
] as const satisfies readonly (keyof LinearIssueSnapshot)[];

export type LinearSyncField = (typeof LINEAR_SYNC_FIELDS)[number];

export type LinearConflictFieldSource = 'linear' | 'local';

export type LinearConflictResolutionStrategy = 'keep_linear' | 'keep_local' | 'merge';

const LINEAR_MUTABLE_FIELDS = [
  'assigneeId',
  'description',
  'labelIds',
  'parentId',
  'priority',
  'projectId',
  'stateId',
  'title',
] as const satisfies readonly LinearSyncField[];

const isLinearSyncField = (field: string): field is LinearSyncField =>
  (LINEAR_SYNC_FIELDS as readonly string[]).includes(field);

const normalizeLabelIds = (value: unknown) => {
  if (!Array.isArray(value) || value.some((id) => typeof id !== 'string')) return value;
  return [...new Set(value)].sort();
};

export const equalLinearIssueFieldValues = (
  field: keyof LinearIssueSnapshot,
  left: unknown,
  right: unknown,
) => {
  const leftValue = field === 'labelIds' ? normalizeLabelIds(left) : left;
  const rightValue = field === 'labelIds' ? normalizeLabelIds(right) : right;
  return JSON.stringify(leftValue) === JSON.stringify(rightValue);
};

export interface LinearIssueMergeResult {
  conflicts: LinearSyncConflict | null;
  merged: LinearIssueSnapshot;
}

/**
 * Apply the three-way merge rule used by the sync worker:
 * - only remote changed -> accept remote;
 * - only local changed -> keep local;
 * - both changed to the same value -> converge;
 * - both changed differently -> preserve local and record a conflict.
 */
export const mergeLinearIssueSnapshots = (input: {
  base: LinearIssueSnapshot;
  local: LinearIssueSnapshot;
  remote: LinearIssueSnapshot;
}): LinearIssueMergeResult => {
  const merged = { ...input.local };
  const conflicts: string[] = [];
  const baseValues: Record<string, unknown> = {};
  const localValues: Record<string, unknown> = {};
  const remoteValues: Record<string, unknown> = {};

  for (const field of LINEAR_SYNC_FIELDS) {
    const baseValue = input.base[field];
    const localValue = field in input.local ? input.local[field] : baseValue;
    const remoteValue = field in input.remote ? input.remote[field] : baseValue;

    if (
      equalLinearIssueFieldValues(field, localValue, baseValue) &&
      !equalLinearIssueFieldValues(field, remoteValue, baseValue)
    ) {
      merged[field] = remoteValue as never;
      continue;
    }

    if (
      equalLinearIssueFieldValues(field, remoteValue, baseValue) ||
      equalLinearIssueFieldValues(field, localValue, remoteValue)
    )
      continue;

    conflicts.push(field);
    baseValues[field] = baseValue;
    localValues[field] = localValue;
    remoteValues[field] = remoteValue;
  }

  return {
    conflicts:
      conflicts.length > 0
        ? {
            base: baseValues,
            detectedAt: new Date().toISOString(),
            fields: conflicts,
            local: localValues,
            remote: remoteValues,
          }
        : null,
    merged,
  };
};

export const changedLinearIssueFields = (base: LinearIssueSnapshot, current: LinearIssueSnapshot) =>
  LINEAR_SYNC_FIELDS.filter((field) => {
    const baseValue = base[field];
    const currentValue = field in current ? current[field] : baseValue;
    return !equalLinearIssueFieldValues(field, baseValue, currentValue);
  });

/** Build the local projection used by both the worker and conflict resolver. */
export const taskLinearIssueSnapshot = (
  task: TaskItem,
  issue: LinearIssueSnapshot,
  baseline: LinearIssueSnapshot,
  settings: LinearProjectBindingSettings,
): LinearIssueSnapshot => ({
  assigneeId:
    settings.assignmentMappings?.find(
      (mapping) =>
        mapping.orviloAgentId === task.assigneeAgentId ||
        mapping.orviloUserId === task.assigneeUserId,
    )?.linearUserId ?? issue.assigneeId,
  id: issue.id,
  identifier: issue.identifier,
  description: task.instruction,
  priority: task.priority,
  // Task.projectId is local. Keep the Linear project UUID on the remote side
  // of the binding and handle local project moves explicitly.
  projectId: issue.projectId,
  stateId:
    settings.statusMappings?.find(
      (mapping) =>
        mapping.workflowCategory === task.workflowCategory ||
        (!mapping.workflowCategory && mapping.localStatus === task.status),
    )?.linearStateId ??
    task.workflowStateId ??
    issue.stateId,
  title: task.name || task.identifier,
  ...(Array.isArray(baseline.labelIds) ? { labelIds: baseline.labelIds } : {}),
});

const taskPriority = (priority: number | null | undefined) => {
  if (priority === null || priority === undefined) return 0;
  return Math.max(0, Math.min(4, priority));
};

/** Convert a chosen Linear snapshot back through the ordinary Task command. */
export const taskPatchForResolvedLinearSnapshot = (
  task: TaskItem,
  local: LinearIssueSnapshot,
  resolved: LinearIssueSnapshot,
  settings: LinearProjectBindingSettings,
): Parameters<TaskModel['update']>[1] => {
  const patch: Parameters<TaskModel['update']>[1] = {};

  if (!equalLinearIssueFieldValues('title', local.title, resolved.title)) {
    patch.name = resolved.title;
  }
  if (!equalLinearIssueFieldValues('description', local.description, resolved.description)) {
    patch.description = resolved.description?.slice(0, 255);
    patch.editorData = null;
    patch.instruction = resolved.description ?? '';
  }
  if (!equalLinearIssueFieldValues('priority', local.priority, resolved.priority)) {
    patch.priority = taskPriority(resolved.priority);
  }
  if (!equalLinearIssueFieldValues('stateId', local.stateId, resolved.stateId)) {
    const statusMapping = settings.statusMappings?.find(
      (mapping) => mapping.linearStateId === resolved.stateId,
    );
    patch.workflowStateId = resolved.stateId ?? null;
    if (statusMapping?.workflowCategory) patch.workflowCategory = statusMapping.workflowCategory;
  }
  if (!equalLinearIssueFieldValues('assigneeId', local.assigneeId, resolved.assigneeId)) {
    if (resolved.assigneeId === null) {
      patch.assigneeAgentId = null;
      patch.assigneeUserId = null;
    } else {
      const assignmentMapping = settings.assignmentMappings?.find(
        (mapping) => mapping.linearUserId === resolved.assigneeId,
      );
      // An unmapped Linear identity remains visible in the remote snapshot. It
      // must not silently clear or overwrite the current local assignee.
      if (assignmentMapping) {
        patch.assigneeAgentId = assignmentMapping.orviloAgentId ?? null;
        patch.assigneeUserId = assignmentMapping.orviloUserId ?? null;
      }
    }
  }

  return patch;
};

export const buildLinearConflictResolution = (input: {
  base: LinearIssueSnapshot;
  conflict: LinearSyncConflict;
  fieldSources?: Record<string, LinearConflictFieldSource>;
  local: LinearIssueSnapshot;
  remote: LinearIssueSnapshot;
  strategy: LinearConflictResolutionStrategy;
}) => {
  const fields = input.conflict.fields.map((field) => {
    if (!isLinearSyncField(field)) throw new Error(`Unsupported Linear conflict field: ${field}`);
    return field;
  });
  const merged = mergeLinearIssueSnapshots({
    base: input.base,
    local: input.local,
    remote: input.remote,
  }).merged;

  for (const field of fields) {
    const source =
      input.strategy === 'keep_local'
        ? 'local'
        : input.strategy === 'keep_linear'
          ? 'linear'
          : input.fieldSources?.[field];
    if (!source) throw new Error(`A merge source is required for ${field}`);
    const values = source === 'local' ? input.conflict.local : input.conflict.remote;
    merged[field] = (field in values ? values[field] : input[source][field]) as never;
  }

  const outboundPatch = Object.fromEntries(
    LINEAR_MUTABLE_FIELDS.flatMap((field) => {
      if (equalLinearIssueFieldValues(field, input.remote[field], merged[field])) return [];
      return field in merged ? [[field, merged[field]]] : [];
    }),
  );

  return { outboundPatch, resolved: merged };
};

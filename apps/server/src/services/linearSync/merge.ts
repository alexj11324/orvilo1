import type { LinearIssueSnapshot, LinearSyncConflict } from '@orvilo/types';

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

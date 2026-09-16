import type { LinearIssueSnapshot, LinearSyncConflict } from '@orvilo/types';

const MERGED_FIELDS = [
  'archivedAt',
  'assigneeId',
  'description',
  'parentId',
  'priority',
  'projectId',
  'stateId',
  'stateType',
  'teamId',
  'title',
  'url',
] as const satisfies readonly (keyof LinearIssueSnapshot)[];

const equal = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

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

  for (const field of MERGED_FIELDS) {
    const baseValue = input.base[field];
    const localValue = field in input.local ? input.local[field] : baseValue;
    const remoteValue = field in input.remote ? input.remote[field] : baseValue;

    if (equal(localValue, baseValue) && !equal(remoteValue, baseValue)) {
      merged[field] = remoteValue as never;
      continue;
    }

    if (equal(remoteValue, baseValue) || equal(localValue, remoteValue)) continue;

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

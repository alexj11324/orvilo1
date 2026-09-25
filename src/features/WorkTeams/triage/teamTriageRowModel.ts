import type {
  TaskCreationSubjectSnapshot,
  TaskWorkflowCategory,
  TeamTriageAction,
} from '@orvilo/types';
import dayjs from 'dayjs';

/**
 * The subset of a work-query task row the triage surface reads.
 * `workAttention.query` returns full task rows; declaring the consumed fields
 * keeps the surface honest about what the server must keep sending.
 */
export interface TeamTriageTask {
  assigneeAgentId?: string | null;
  assigneeUserId?: string | null;
  createdAt?: Date | string | null;
  createdBySnapshot?: TaskCreationSubjectSnapshot | null;
  createdByUserId?: string | null;
  domainRevision?: number;
  id: string;
  identifier?: string | null;
  instruction?: string | null;
  name?: string | null;
  priority?: number | null;
  status?: string | null;
  workflowCategory?: TaskWorkflowCategory;
  workflowStateId?: string | null;
}

/**
 * Linear's triage row carries a dedicated Snooze control. Ours renders
 * disabled: `tasks` has no snoozed column, `TaskTriageStatus` has no `snoozed`
 * value, and `workAttention.triage` accepts only
 * accept/decline/duplicate/reassign — there is nothing a snooze write could
 * land on. Flip this only together with the schema and the mutation enum.
 */
export const TEAM_TRIAGE_SNOOZE_ENABLED = false;

export interface TeamTriageMutationExtras {
  assigneeUserId?: string;
  canonicalTaskId?: string;
}

/**
 * Maps a row action to the `workAttention.triage` payload, or `null` when the
 * write cannot run honestly: a missing `domainRevision` would skip the
 * optimistic-concurrency guard, and reassign/duplicate without their required
 * target id would only fail server-side.
 */
export const buildTriageMutationInput = (
  task: Pick<TeamTriageTask, 'domainRevision' | 'id'>,
  teamId: string,
  action: TeamTriageAction,
  extras: TeamTriageMutationExtras = {},
) => {
  if (task.domainRevision === undefined) return null;
  if (action === 'reassign' && !extras.assigneeUserId) return null;
  if (action === 'duplicate' && !extras.canonicalTaskId) return null;
  return {
    action,
    expectedDomainRevision: task.domainRevision,
    taskId: task.id,
    teamId,
    ...(extras.assigneeUserId ? { assigneeUserId: extras.assigneeUserId } : {}),
    ...(extras.canonicalTaskId ? { canonicalTaskId: extras.canonicalTaskId } : {}),
  };
};

/** What the row needs to draw the creator chip — name for initials, avatar src. */
export interface TeamTriageMemberProfile {
  avatar?: string | null;
  name?: string | null;
}

export interface TeamTriageCreator {
  avatar?: string | null;
  name?: string;
}

/**
 * Resolves the row's creator chip. The workspace-member profile wins on avatar
 * (the creation snapshot stores no image); `createdBySnapshot.displayName`
 * covers creators outside the directory — agents, integrations, departed
 * members. Returns undefined only when there is truly nothing to show.
 */
export const resolveTriageCreator = (
  task: Pick<TeamTriageTask, 'createdBySnapshot' | 'createdByUserId'>,
  profiles: ReadonlyMap<string, TeamTriageMemberProfile>,
): TeamTriageCreator | undefined => {
  const profile = task.createdByUserId ? profiles.get(task.createdByUserId) : undefined;
  const name = profile?.name || task.createdBySnapshot?.displayName || undefined;
  const avatar = profile?.avatar ?? null;
  if (!name && !avatar) return undefined;
  return { avatar, name };
};

/**
 * Reassign targets are team members — the server rejects anyone else — but the
 * label comes from the workspace directory so rows read a name, not a userId.
 */
export const triageAssigneeOptions = (
  teamMembers: ReadonlyArray<{ userId: string }>,
  profiles: ReadonlyMap<string, TeamTriageMemberProfile>,
  currentAssigneeUserId?: string | null,
): Array<{ label: string; value: string }> =>
  teamMembers
    .filter((member) => member.userId !== currentAssigneeUserId)
    .map((member) => ({
      label: profiles.get(member.userId)?.name || member.userId,
      value: member.userId,
    }));

/**
 * Linear-style compact triage age: `m` → `h` → `d` → `w` → `mo` → `y`, first
 * meaningful unit wins. Compact units stay language-neutral so the marker needs
 * no per-locale plural forms; the full date rides the row's title tooltip.
 */
export const triageAgeLabel = (
  createdAt: Date | string | null | undefined,
  now: Date | string = new Date(),
): string => {
  if (!createdAt) return '';
  const created = dayjs(createdAt);
  if (!created.isValid()) return '';
  const current = dayjs(now);
  const minutes = Math.max(0, current.diff(created, 'minute'));
  if (minutes < 60) return `${Math.max(1, minutes)}m`;
  const hours = current.diff(created, 'hour');
  if (hours < 24) return `${hours}h`;
  const days = current.diff(created, 'day');
  if (days < 7) return `${days}d`;
  const weeks = current.diff(created, 'week');
  if (weeks < 5) return `${weeks}w`;
  const months = current.diff(created, 'month');
  if (months < 12) return `${months}mo`;
  return `${Math.max(1, current.diff(created, 'year'))}y`;
};

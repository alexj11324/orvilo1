import type { ProjectHealth, WorkQuery } from '@orvilo/types';
import { PROJECT_HEALTH_STATES } from '@orvilo/types';

import type { ProjectListItem } from '@/store/project/store';

/**
 * Team projects tab — pure logic.
 *
 * The surface feeds on two sources:
 * - the `workAttention.query` project scan scoped by `teamId` — authoritative
 *   for team membership and readability (same `buildProjectReadableWhere` the
 *   workspace list uses);
 * - the workspace project list (`project.list`) — carries the computed
 *   `taskCount`/`progressPercent` the work query does not project.
 *
 * `enrichTeamProjects` joins the two so the shared `ProjectRow` table can
 * render real Issues/Status values instead of `—` placeholders.
 */

/** Linear's `/team/:key/projects` query: every readable project linked to the team. */
export const teamProjectsWorkQuery = (teamId: string): WorkQuery => ({
  entityType: 'project',
  filter: { all: [{ field: 'teamId', op: 'eq', value: teamId }] },
  schemaVersion: 1,
});

/**
 * The raw row shape `queryProjects` returns — the `projects` table record.
 * It lacks the `taskCount`/`progressPercent` projections the workspace list
 * computes, which is what the enrichment join supplies.
 */
export interface TeamProjectQueryRow {
  id: string;
  name: string;
}

/**
 * Join team-scoped rows onto the workspace list by id. A matched row renders
 * the workspace projection wholesale — same underlying record, plus the
 * computed columns and whatever freshness the store carries (lead edits write
 * back into it). An unmatched row passes through as-is: presence on this tab
 * is governed by the team query alone, so a project linked moments ago still
 * renders — with the shared row's `—` fallbacks — until the list catches up.
 */
export const enrichTeamProjects = <R extends TeamProjectQueryRow>(
  teamRows: readonly R[],
  workspaceList: readonly ProjectListItem[],
): ProjectListItem[] => {
  const byId = new Map(workspaceList.map((item) => [item.id, item]));
  // The unmatched pass-through is a full projects-table record at runtime —
  // the generic only proves `{id, name}`, hence the two-step cast.
  return teamRows.map((row) => byId.get(row.id) ?? (row as unknown as ProjectListItem));
};

/* ------------------------- Aggregate sidebar ------------------------- */

export interface TeamProjectsLeadCount {
  count: number;
  /** `null` buckets the lead-less rows — rendered as "No lead". */
  userId: string | null;
}

export interface TeamProjectsSummary {
  /** Non-zero health buckets in workflow order (onTrack → atRisk → offTrack). */
  health: { count: number; state: ProjectHealth }[];
  /** Non-zero lead buckets, most-led first; `null` userId lands last. */
  leads: TeamProjectsLeadCount[];
  /** Rows carrying no health signal — the reference's "Update missing" count. */
  updateMissing: number;
}

/**
 * Aggregates behind the toolbar's Open sidebar toggle. The reference also
 * lists a Teams section; the team query rows carry no per-project team list,
 * so the section is honestly omitted rather than fabricated.
 */
export const summarizeTeamProjects = (
  rows: readonly { health?: null | string; leadUserId?: null | string }[],
  leadName?: (userId: string) => string | undefined,
): TeamProjectsSummary => {
  const healthCounts = new Map<ProjectHealth, number>();
  const leadCounts = new Map<null | string, number>();
  let updateMissing = 0;

  for (const row of rows) {
    const health = row.health as ProjectHealth | null | undefined;
    if (health && (PROJECT_HEALTH_STATES as readonly string[]).includes(health)) {
      healthCounts.set(health, (healthCounts.get(health) ?? 0) + 1);
    } else {
      updateMissing += 1;
    }
    const lead = row.leadUserId ?? null;
    leadCounts.set(lead, (leadCounts.get(lead) ?? 0) + 1);
  }

  const health = PROJECT_HEALTH_STATES.filter((state) => healthCounts.has(state)).map((state) => ({
    count: healthCounts.get(state)!,
    state,
  }));

  const leads = [...leadCounts.entries()]
    .map(([userId, count]) => ({ count, userId }))
    .sort((a, b) => {
      if (a.userId === null) return 1;
      if (b.userId === null) return -1;
      if (a.count !== b.count) return b.count - a.count;
      const nameA = leadName?.(a.userId) ?? a.userId;
      const nameB = leadName?.(b.userId) ?? b.userId;
      return nameA.localeCompare(nameB);
    });

  return { health, leads, updateMissing };
};

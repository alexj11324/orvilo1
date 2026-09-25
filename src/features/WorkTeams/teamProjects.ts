import type { WorkQuery } from '@orvilo/types';

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

// Single implementation lives next to the shared sidebar component so the
// workspace projects list reuses the same summary the team surface renders.
export type {
  ProjectListLeadCount as TeamProjectsLeadCount,
  ProjectListSummary as TeamProjectsSummary,
} from '@/features/Projects/List/aggregateSummary';
export { summarizeProjectList } from '@/features/Projects/List/aggregateSummary';

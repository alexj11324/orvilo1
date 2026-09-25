import type { ProjectHealth } from '@orvilo/types';
import { PROJECT_HEALTH_STATES } from '@orvilo/types';

import {
  CLOSED_PROJECT_STATUSES,
  type ClosedWindowRow,
  filterClosedProjects,
  type ProjectListClosedWindow,
} from './displayOptions';

export interface ProjectListLeadCount {
  count: number;
  /** `null` buckets the lead-less rows — rendered as "No lead". */
  userId: null | string;
}

export interface ProjectListSummary {
  /** Non-zero health buckets in workflow order (onTrack → atRisk → offTrack). */
  health: { count: number; state: ProjectHealth }[];
  /** Non-zero lead buckets, most-led first; `null` userId lands last. */
  leads: ProjectListLeadCount[];
  /**
   * Rows in a terminal status — the reference's "No update expected" callout.
   * A closed project stops reporting, so it leaves the health/update-missing
   * buckets and lands here instead (each row counts exactly once).
   */
  noUpdateExpected: number;
  /** Open rows carrying no health signal — the reference's "Update missing" count. */
  updateMissing: number;
}

const CLOSED_SET: ReadonlySet<string> = new Set(CLOSED_PROJECT_STATUSES);

/**
 * Rows the sidebar summary counts. A bucket's number promises exactly what
 * its click shows, so the base is the loaded set minus what the closed-window
 * display option removes — those rows can never render in the table. Applied
 * filters and the search keyword intentionally do NOT narrow the base:
 * bucket counts stay stable while a bucket filter narrows the table.
 */
export const projectListSummaryRows = <T extends ClosedWindowRow>(
  rows: readonly T[],
  showClosed: ProjectListClosedWindow,
  now: Date = new Date(),
): T[] => filterClosedProjects([...rows], showClosed, now);

/**
 * Aggregates behind the toolbar's Open sidebar toggle. Counts always cover
 * the full loaded set — the reference's buckets stay stable while a bucket
 * filter narrows the table.
 *
 * The Teams tab is sourced separately (team router projectIds joined onto
 * the listed ids — see ProjectListAggregateSidebar) because it needs data
 * the rows do not carry; everything here derives from row fields alone.
 */
export const summarizeProjectList = (
  rows: readonly {
    health?: null | string;
    leadUserId?: null | string;
    status?: null | string;
  }[],
  leadName?: (userId: string) => string | undefined,
): ProjectListSummary => {
  const healthCounts = new Map<ProjectHealth, number>();
  const leadCounts = new Map<null | string, number>();
  let noUpdateExpected = 0;
  let updateMissing = 0;

  for (const row of rows) {
    if (row.status && CLOSED_SET.has(row.status)) {
      noUpdateExpected += 1;
    } else {
      const health = row.health as ProjectHealth | null | undefined;
      if (health && (PROJECT_HEALTH_STATES as readonly string[]).includes(health)) {
        healthCounts.set(health, (healthCounts.get(health) ?? 0) + 1);
      } else {
        updateMissing += 1;
      }
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

  return { health, leads, noUpdateExpected, updateMissing };
};

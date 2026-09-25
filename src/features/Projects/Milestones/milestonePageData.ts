import type { ProjectDetail } from '@/store/project';

/**
 * The milestone fields the Milestones tab needs. Structural rather than
 * `ProjectDetail['milestones'][number]` so the helpers stay testable without
 * pulling the store module into a pure-function test.
 */
export interface MilestoneListItem {
  date?: string | null;
  id: string;
  progress?: MilestoneProgressSource | null;
  sortOrder?: number | null;
}

interface MilestoneProgressSource {
  completed: number;
  issues: number;
  percent?: number | null;
}

export type MilestoneRow = NonNullable<ProjectDetail['milestones']>[number];

/**
 * Order for the dedicated milestones page.
 *
 * The overview section keeps the manual `sortOrder` a user can drag — that is
 * a planning sequence. A page whose second column is the *target date* only
 * reads coherently in chronological order, so the tab sorts by date ascending
 * and sinks undated milestones to the bottom (a milestone without a target
 * date has no place on a timeline). `sortOrder` breaks date ties so the two
 * surfaces can never disagree about two milestones sharing a day, and `id`
 * keeps the comparison total for stable renders.
 */
export const compareMilestonesForList = (a: MilestoneListItem, b: MilestoneListItem): number => {
  const dateA = a.date ?? null;
  const dateB = b.date ?? null;
  // `date` is a `YYYY-MM-DD` day column, so lexical order is chronological
  // order — no Date parsing and no timezone drift.
  if (dateA && dateB && dateA !== dateB) return dateA < dateB ? -1 : 1;
  if (dateA && !dateB) return -1;
  if (dateB && !dateA) return 1;
  const order = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  if (order !== 0) return order;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};

export const sortMilestonesForList = <T extends MilestoneListItem>(milestones: readonly T[]): T[] =>
  [...milestones].sort(compareMilestonesForList);

export interface MilestoneProgressView {
  completed: number;
  issues: number;
  /** 0–100, derived from the fraction so the bar and the text cannot disagree. */
  percent: number;
}

/**
 * Normalise a milestone's progress readout for the row.
 *
 * `null` stays `null`: the server withholds the readout when a linked task's
 * workflow category cannot be classified, and an honest "unavailable" beats a
 * number that quietly drops work. The percent is recomputed from the
 * `completed / issues` fraction rather than trusting the carried value —
 * one source of truth means the mini bar, the percentage and the `3/5`
 * fraction cannot drift apart. This is the same scope rule
 * `ProjectModel.listMilestoneProgress` tallies by (canceled issues leave the
 * denominator; an empty denominator reads 0%).
 */
export const milestoneProgressView = (
  progress: MilestoneProgressSource | null | undefined,
): MilestoneProgressView | null => {
  if (!progress) return null;
  const { completed, issues } = progress;
  const percent = issues === 0 ? 0 : Math.min(100, Math.round((completed / issues) * 100));
  return { completed, issues, percent };
};

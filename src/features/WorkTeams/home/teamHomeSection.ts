import { TRIAGE_EXCLUSION_FILTER, type WorkQuery } from '@orvilo/types';

/**
 * Team Home sub-tab contract (`?tab=home&section=…`).
 *
 * Linear mounts Overview / Documents / Members as separate routes under the
 * team page (`/team/ORV/overview|documents|members`). The candidate keeps one
 * `/teams/:teamId?tab=home` surface — accepted query-param scheme — so the
 * sub-tab rides a second `section` param the home subtree owns end to end:
 * TeamPage only gates `tab=home`, and every section keeps a distinct,
 * back-navigable URL.
 */
export type TeamHomeSection = 'overview' | 'documents' | 'members';

export const TEAM_HOME_SECTIONS = ['overview', 'documents', 'members'] as const;

export const resolveTeamHomeSection = (value: string | null | undefined): TeamHomeSection =>
  (TEAM_HOME_SECTIONS as readonly string[]).includes(value ?? '')
    ? (value as TeamHomeSection)
    : 'overview';

/**
 * Preserve the team destination and unrelated params while switching home
 * sub-tabs. The default section leaves no `section` param — same convention
 * as `scope=all` on the issues tab — so `/teams/:id?tab=home` stays the
 * canonical overview URL.
 */
export const nextTeamHomeSectionNavigation = (
  current: URLSearchParams,
  section: TeamHomeSection,
): [URLSearchParams, { replace: false }] => {
  const next = new URLSearchParams(current);
  if (section === 'overview') next.delete('section');
  else next.set('section', section);
  return [next, { replace: false }];
};

/** Workspace-link target for a sub-tab. `tab=home` is forced back in so a
 * section link built while another `tab` param lingers cannot strand the
 * navigation on a different team surface. */
export const teamHomeSectionTo = (
  teamId: string,
  current: URLSearchParams,
  section: TeamHomeSection,
): string => {
  const base = new URLSearchParams(current);
  base.set('tab', 'home');
  const [next] = nextTeamHomeSectionNavigation(base, section);
  const query = next.toString();
  return `/teams/${teamId}${query ? `?${query}` : ''}`;
};

/** Preview rows under the overview's activity block. */
export const TEAM_HOME_RECENT_LIMIT = 5;

/**
 * "Recent issues" — the overview's activity-ish block. Same team scope and
 * untriaged exclusion as the Issues tab, flattened (no `groupBy`) and ordered
 * by `updatedAt` so the freshest work floats up. The page size rides the
 * `workAttentionService.query` `limit` argument, not the query.
 */
export const teamRecentIssuesQuery = (teamId: string, triageCapable: boolean): WorkQuery => ({
  entityType: 'task',
  filter: {
    all: [
      { field: 'teamId', op: 'eq', value: teamId },
      // NULL-inclusive like the Issues tab: legacy rows keep NULL
      // `triage_status` and a bare `neq` would hide them.
      ...(triageCapable ? [TRIAGE_EXCLUSION_FILTER] : []),
    ],
  },
  layout: 'list',
  schemaVersion: 1,
  sort: [{ direction: 'desc', field: 'updatedAt' }],
});

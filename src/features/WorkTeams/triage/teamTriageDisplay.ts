import type { WorkQuerySort } from '@orvilo/types';

/**
 * Team triage display + URL state (audit G3 — Linear's Display options).
 *
 * Linear keeps the queue ordering addressable the same way the issues surface
 * does, so every control writes a query param: reload and Back/forward
 * restore the same surface. Params are namespaced `triage*` and omitted at
 * their defaults so a clean URL stays `?tab=triage`.
 *
 * `Added to triage` ascending is the queue default — it maps to the server's
 * untriaged ordering, so it sends no explicit `sort` (same contract as the
 * issues surface's `default` ordering).
 */
export type TeamTriageOrdering = 'addedToTriage' | 'priority' | 'updated';
export type TeamTriageDirection = 'asc' | 'desc';

export interface TeamTriageDisplay {
  /** Sort direction applied to `ordering` (Linear's Direction button). */
  direction: TeamTriageDirection;
  /** Ordering field — `addedToTriage` is the observed reference label. */
  ordering: TeamTriageOrdering;
  /** Display property: the identifier chip on each row (Linear's `ID` chip). */
  showId: boolean;
}

export const DEFAULT_TEAM_TRIAGE_DISPLAY: TeamTriageDisplay = {
  direction: 'asc',
  ordering: 'addedToTriage',
  showId: true,
};

export const TEAM_TRIAGE_ORDERINGS: readonly TeamTriageOrdering[] = [
  'addedToTriage',
  'priority',
  'updated',
];

const TRIAGE_ORDERING_FIELD = {
  addedToTriage: 'createdAt',
  priority: 'priority',
  updated: 'updatedAt',
} as const satisfies Record<TeamTriageOrdering, WorkQuerySort['field']>;

/**
 * Ordering → work-query sort. The default (`addedToTriage` asc) leaves the
 * server's queue ordering untouched; every other combination is explicit and
 * carries an `id` tie-breaker so equal fields keep a stable row order.
 */
export const teamTriageSort = (
  display: Pick<TeamTriageDisplay, 'direction' | 'ordering'>,
): WorkQuerySort[] | undefined => {
  if (display.ordering === 'addedToTriage' && display.direction === 'asc') return undefined;
  return [
    { direction: display.direction, field: TRIAGE_ORDERING_FIELD[display.ordering] },
    { direction: 'asc', field: 'id' },
  ];
};

/* ------------------------------- URL state ------------------------------- */

export const readTeamTriageUrlState = (params: URLSearchParams): TeamTriageDisplay => {
  const ordering = params.get('triageOrdering');
  return {
    direction: params.get('triageDir') === 'desc' ? 'desc' : 'asc',
    ordering: (TEAM_TRIAGE_ORDERINGS as readonly string[]).includes(ordering ?? '')
      ? (ordering as TeamTriageOrdering)
      : DEFAULT_TEAM_TRIAGE_DISPLAY.ordering,
    showId: params.get('triageId') !== '0',
  };
};

export interface TeamTriageUrlPatch {
  direction?: TeamTriageDirection;
  ordering?: TeamTriageOrdering;
  showId?: boolean;
}

const TRIAGE_PARAM_KEYS = ['triageDir', 'triageId', 'triageOrdering'] as const;

/**
 * Write the touched display params, leaving every other param (tab, scope,
 * issues/view state) untouched. Defaults delete the param so the address
 * stays canonical.
 */
export const patchTeamTriageParams = (
  current: URLSearchParams,
  patch: TeamTriageUrlPatch,
): URLSearchParams => {
  const next = new URLSearchParams(current);
  if (patch.ordering !== undefined) {
    if (patch.ordering === DEFAULT_TEAM_TRIAGE_DISPLAY.ordering) next.delete('triageOrdering');
    else next.set('triageOrdering', patch.ordering);
  }
  if (patch.direction !== undefined) {
    if (patch.direction === DEFAULT_TEAM_TRIAGE_DISPLAY.direction) next.delete('triageDir');
    else next.set('triageDir', patch.direction);
  }
  if (patch.showId !== undefined) {
    if (patch.showId) next.delete('triageId');
    else next.set('triageId', '0');
  }
  return next;
};

/** Display-options Reset — clears only the triage display params. */
export const resetTeamTriageDisplayParams = (current: URLSearchParams): URLSearchParams => {
  const next = new URLSearchParams(current);
  for (const key of TRIAGE_PARAM_KEYS) next.delete(key);
  return next;
};

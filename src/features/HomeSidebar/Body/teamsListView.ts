export type TeamsListView = 'error' | 'fallback' | 'loading' | 'teams';

interface ResolveTeamsListViewInput {
  /** The thrown SWR error from the teams request, if any. */
  error?: unknown;
  /** SWR `isLoading`: a request is in flight and there is no data yet. */
  isLoading: boolean;
  /** Joined teams, after filtering. */
  teamCount: number;
}

/**
 * What the "Your teams" section renders in place of its team rows. The
 * `fallback` row (a link to the /teams directory) is the intended empty state
 * and also stands in before the workspace is provisioned, but it must not
 * double as the loading and failure state: a failed request would read as
 * "you have no teams", and the swap from fallback to rows would shift the list.
 * A failed refresh keeps the teams already loaded.
 */
export const resolveTeamsListView = ({
  error,
  isLoading,
  teamCount,
}: ResolveTeamsListViewInput): TeamsListView => {
  if (teamCount > 0) return 'teams';
  if (error) return 'error';
  if (isLoading) return 'loading';

  return 'fallback';
};

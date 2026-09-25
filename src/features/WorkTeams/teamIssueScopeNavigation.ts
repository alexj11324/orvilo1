import type { TeamIssueScope } from './teamWorkQuery';

/** Preserve the team destination and any future route-backed filters while
 * switching between the three addressable issue scopes. */
export const nextTeamIssueScopeNavigation = (
  current: URLSearchParams,
  scope: TeamIssueScope,
): [URLSearchParams, { replace: false }] => {
  const next = new URLSearchParams(current);
  if (scope === 'all') next.delete('scope');
  else next.set('scope', scope);
  return [next, { replace: false }];
};

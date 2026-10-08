import { describe, expect, it } from 'vitest';

import { resolveTeamsListView } from './teamsListView';

describe('resolveTeamsListView', () => {
  it('shows a loading state instead of the empty-state link while the first request runs', () => {
    expect(resolveTeamsListView({ isLoading: true, teamCount: 0 })).toBe('loading');
  });

  it('shows an error instead of "no teams" when the request failed', () => {
    expect(resolveTeamsListView({ error: new Error('boom'), isLoading: false, teamCount: 0 })).toBe(
      'error',
    );
  });

  it('keeps the loaded teams when a refresh fails', () => {
    expect(resolveTeamsListView({ error: new Error('boom'), isLoading: false, teamCount: 2 })).toBe(
      'teams',
    );
  });

  it('falls back to the directory link when there are no joined teams or no request yet', () => {
    expect(resolveTeamsListView({ isLoading: false, teamCount: 0 })).toBe('fallback');
  });
});

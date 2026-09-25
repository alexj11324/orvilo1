import { describe, expect, it } from 'vitest';

import { teamHomeDestinations } from './teamHomeDestinations';

describe('team Home destinations', () => {
  it('opens the current team’s Active issues from Home while preserving distinct routes', () => {
    expect(teamHomeDestinations('team-42', 'workspace-a', true)).toEqual([
      { key: 'triage', to: '/workspace-a/teams/team-42?tab=triage' },
      { key: 'issues', to: '/workspace-a/teams/team-42?tab=issues&scope=active' },
      { key: 'projects', to: '/workspace-a/teams/team-42?tab=projects' },
      { key: 'views', to: '/workspace-a/teams/team-42?tab=views' },
    ]);
  });

  it('does not expose Triage when intake is disabled', () => {
    expect(teamHomeDestinations('team-42', 'workspace-a', false).map(({ key }) => key)).toEqual([
      'issues',
      'projects',
      'views',
    ]);
  });
});

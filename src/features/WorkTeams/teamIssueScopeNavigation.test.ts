import { createMemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { nextTeamIssueScopeNavigation } from './teamIssueScopeNavigation';

describe('team issue scope navigation', () => {
  it('keeps the team Issues destination and other route state when switching scope', () => {
    const current = new URLSearchParams('tab=issues&cycle=cycle-1&scope=active');

    const [next, options] = nextTeamIssueScopeNavigation(current, 'backlog');
    expect(next.toString()).toBe('tab=issues&cycle=cycle-1&scope=backlog');
    expect(options).toEqual({ replace: false });
    expect(current.toString()).toBe('tab=issues&cycle=cycle-1&scope=active');
  });

  it('uses the default all route without a scope parameter', () => {
    const current = new URLSearchParams('tab=issues&scope=backlog');

    expect(nextTeamIssueScopeNavigation(current, 'all')[0].toString()).toBe('tab=issues');
  });

  it('lets browser Back restore the prior team issue scope', async () => {
    const router = createMemoryRouter([{ path: '/teams/:teamId' }], {
      initialEntries: ['/teams/team-1?tab=issues'],
    });

    const [active, activeOptions] = nextTeamIssueScopeNavigation(
      new URLSearchParams(router.state.location.search),
      'active',
    );
    await router.navigate({ search: active.toString() }, activeOptions);
    const [backlog, backlogOptions] = nextTeamIssueScopeNavigation(
      new URLSearchParams(router.state.location.search),
      'backlog',
    );
    await router.navigate({ search: backlog.toString() }, backlogOptions);

    expect(router.state.location.search).toBe('?tab=issues&scope=backlog');
    await router.navigate(-1);
    expect(router.state.location.search).toBe('?tab=issues&scope=active');
  });
});

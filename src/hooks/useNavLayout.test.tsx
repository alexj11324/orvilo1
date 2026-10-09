import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useNavLayout } from './useNavLayout';

vi.mock('@/store/global', () => ({
  useGlobalStore: (selector: (state: { toggleCommandMenu: () => void }) => unknown) =>
    selector({ toggleCommandMenu: vi.fn() }),
}));

vi.mock('@/store/serverConfig', () => ({
  featureFlagsSelectors: {},
  useServerConfigStore: () => ({ hideGitHub: false }),
}));

/**
 * Keys retired from the primary sidebar by the Linear IA convergence. They must
 * not render from any code path — routes stay reachable, the sidebar does not.
 */
const RETIRED_SIDEBAR_KEYS = [
  'drafts',
  'community',
  'image',
  'memory',
  'pages',
  'home',
  'reviews',
  'create',
  'automations',
  'resource',
  'recents',
  'private',
  'project',
  'views',
];

const renderedKeys = () => {
  const { result } = renderHook(() => useNavLayout());
  return [...result.current.topNavItems, ...result.current.bottomMenuItems].map((item) => item.key);
};

describe('useNavLayout', () => {
  it.each(RETIRED_SIDEBAR_KEYS)('never renders the retired "%s" destination', (key) => {
    expect(renderedKeys()).not.toContain(key);
  });

  it('keeps the fixed primary entries: Issues, inbox, my work, agent, groups', () => {
    const { result } = renderHook(() => useNavLayout());
    const keys = result.current.topNavItems.map((item) => item.key);

    expect(keys).toEqual(['tasks', 'inbox', 'my-work', 'agent', 'group']);
    expect(result.current.topNavItems.find((item) => item.key === 'inbox')?.url).toBe('/inbox');
    expect(result.current.topNavItems.find((item) => item.key === 'my-work')?.url).toBe(
      '/my-issues',
    );
    expect(result.current.topNavItems.find((item) => item.key === 'tasks')?.url).toBe('/tasks');
    // Agent lands on the workspace session (builtin inbox agent), not the
    // agents view-all list — `/agent` alone has no index and redirects away.
    expect(result.current.topNavItems.find((item) => item.key === 'agent')?.url).toBe(
      '/agent/inbox',
    );
    // Groups is a first-class destination: `/group` resolves to the most
    // recent group or the empty state, never a redirect away.
    expect(result.current.topNavItems.find((item) => item.key === 'group')?.url).toBe('/group');
  });
});

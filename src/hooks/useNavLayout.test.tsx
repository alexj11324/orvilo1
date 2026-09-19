import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

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
  'community',
  'image',
  'memory',
  'pages',
  'home',
  'tasks',
  'automations',
  'resource',
  'recents',
  'private',
  'project',
  'views',
];

const renderedKeys = async () => {
  const { useNavLayout } = await import('./useNavLayout');
  const { result } = renderHook(() => useNavLayout());
  return [...result.current.topNavItems, ...result.current.bottomMenuItems].map((item) => item.key);
};

describe('useNavLayout', () => {
  it.each(RETIRED_SIDEBAR_KEYS)('never renders the retired "%s" destination', async (key) => {
    expect(await renderedKeys()).not.toContain(key);
  });

  it('keeps the fixed primary entries: inbox, my work, reviews', async () => {
    const { useNavLayout } = await import('./useNavLayout');
    const { result } = renderHook(() => useNavLayout());
    const keys = result.current.topNavItems.map((item) => item.key);

    expect(keys).toEqual(['inbox', 'my-work', 'reviews']);
    expect(result.current.topNavItems.find((item) => item.key === 'inbox')?.url).toBe('/inbox');
    expect(result.current.topNavItems.find((item) => item.key === 'my-work')?.url).toBe('/my-work');
    expect(result.current.topNavItems.find((item) => item.key === 'reviews')?.url).toBe(
      '/my-work?tab=review',
    );
  });
});

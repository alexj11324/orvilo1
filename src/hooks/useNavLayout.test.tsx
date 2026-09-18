import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/config/routes', () => ({
  getRouteById: (id: string) => ({ icon: () => id }),
}));

vi.mock('@/store/global', () => ({
  useGlobalStore: (selector: (state: { toggleCommandMenu: () => void }) => unknown) =>
    selector({ toggleCommandMenu: vi.fn() }),
}));

vi.mock('@/store/serverConfig', () => ({
  featureFlagsSelectors: {},
  useServerConfigStore: () => ({ hideGitHub: false }),
}));

/**
 * Sidebar keys whose product surface has been withdrawn by the task-first
 * convergence. They must not render from any code path, and they must not come
 * back through a persisted preference either — the preference side is covered by
 * the system-status normalizer tests.
 */
const RETIRED_SIDEBAR_KEYS = ['community', 'image', 'memory', 'pages'];

const renderedKeys = async () => {
  const { useNavLayout } = await import('./useNavLayout');
  const { result } = renderHook(() => useNavLayout());
  return [...result.current.topNavItems, ...result.current.bottomMenuItems].map((item) => item.key);
};

describe('useNavLayout', () => {
  it.each(RETIRED_SIDEBAR_KEYS)('never renders the retired "%s" destination', async (key) => {
    expect(await renderedKeys()).not.toContain(key);
  });

  it('keeps the task destination reachable', async () => {
    const { useNavLayout } = await import('./useNavLayout');
    const { result } = renderHook(() => useNavLayout());

    const tasksItem = result.current.topNavItems.find((item) => item.key === 'tasks');

    expect(tasksItem).toBeDefined();
    expect(tasksItem?.url).toBe('/tasks');
  });

  it('keeps the automation destination reachable', async () => {
    const { useNavLayout } = await import('./useNavLayout');
    const { result } = renderHook(() => useNavLayout());

    const automationsItem = result.current.topNavItems.find((item) => item.key === 'automations');

    expect(automationsItem).toBeDefined();
    expect(automationsItem?.url).toBe('/automations');
  });
});

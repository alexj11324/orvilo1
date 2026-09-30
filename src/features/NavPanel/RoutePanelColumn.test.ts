import { act, renderHook } from '@testing-library/react';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NavPanelPortal } from './NavPanelPortal';
import {
  clearNavPanelRegistry,
  registerNavPanelContent,
  unregisterNavPanelContent,
} from './registry';
import { useRoutePanelNode } from './RoutePanelColumn';

let pathname = '/orvilo-team/agent/assistant';

interface WorkspaceMock {
  activeWorkspaceId: string;
  workspaces: { id: string; slug: string }[];
}

const workspaceState: WorkspaceMock = {
  activeWorkspaceId: 'workspace-1',
  workspaces: [{ id: 'workspace-1', slug: 'orvilo-team' }],
};

vi.mock('react-router', () => ({
  useLocation: () => ({ pathname }),
}));

vi.mock('@/business/client/hooks/useActiveWorkspaceSlug', () => ({
  useActiveWorkspaceSlug: () =>
    workspaceState.workspaces.find((workspace) => workspace.id === workspaceState.activeWorkspaceId)
      ?.slug ?? null,
}));

vi.mock('@/hooks/useActiveLocation', () => ({
  useActiveLocation: () => ({ pathname }),
}));

const AGENT_NODE = createElement('div', null, 'Agent topic list');

describe('useRoutePanelNode', () => {
  beforeEach(() => clearNavPanelRegistry());

  it('returns the registered route panel node', () => {
    pathname = '/orvilo-team/agent/assistant';
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(
        'div',
        null,
        createElement(NavPanelPortal, { navKey: 'agent' }, AGENT_NODE),
        children,
      );
    const { result } = renderHook(() => useRoutePanelNode(), { wrapper });

    expect(result.current).toBe(AGENT_NODE);
  });

  it.each(['/orvilo-team/tasks', '/settings/profile', '/orvilo-team/settings/general'])(
    'returns undefined on %s even when a panel is registered',
    (route) => {
      pathname = route;
      const owner = Symbol('agent');
      registerNavPanelContent('agent', owner, AGENT_NODE);
      const { result } = renderHook(() => useRoutePanelNode());
      expect(result.current).toBeUndefined();
    },
  );

  it('follows registry updates when the panel unregisters', () => {
    pathname = '/orvilo-team/memory';
    const owner = Symbol('memory');
    const { result } = renderHook(() => useRoutePanelNode());
    expect(result.current).toBeUndefined();

    act(() => registerNavPanelContent('memory', owner, AGENT_NODE));
    expect(result.current).toBe(AGENT_NODE);

    act(() => unregisterNavPanelContent('memory', owner));
    expect(result.current).toBeUndefined();
  });
});

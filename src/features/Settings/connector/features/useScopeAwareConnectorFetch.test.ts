import { toast } from '@lobehub/ui/base-ui';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useScopeAwareConnectorFetch } from './useScopeAwareConnectorFetch';

const mocks = vi.hoisted(() => ({
  fetchAgentBoundConnectors: vi.fn(),
  fetchConnectors: vi.fn(),
  t: (key: string) => key,
  workspaceId: undefined as string | null | undefined,
}));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: mocks.t }) }));

vi.mock('@/business/client/hooks/useActiveWorkspaceId', () => ({
  useActiveWorkspaceId: () => mocks.workspaceId,
}));

vi.mock('@/store/tool', () => ({
  useToolStore: (selector: (state: unknown) => unknown) =>
    selector({
      fetchAgentBoundConnectors: mocks.fetchAgentBoundConnectors,
      fetchConnectors: mocks.fetchConnectors,
    }),
}));

describe('useScopeAwareConnectorFetch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.workspaceId = undefined;
  });

  it('refetches both connector lists when the workspace id resolves after mount', () => {
    mocks.workspaceId = null;
    const { rerender } = renderHook(() => useScopeAwareConnectorFetch());

    expect(mocks.fetchConnectors).toHaveBeenCalledTimes(1);
    expect(mocks.fetchAgentBoundConnectors).toHaveBeenCalledTimes(1);

    mocks.workspaceId = 'ws-1';
    rerender();

    expect(mocks.fetchConnectors).toHaveBeenCalledTimes(2);
    expect(mocks.fetchAgentBoundConnectors).toHaveBeenCalledTimes(2);
  });

  it('does not refetch while the workspace scope is unchanged', () => {
    mocks.workspaceId = 'ws-1';
    const { rerender } = renderHook(() => useScopeAwareConnectorFetch());

    rerender();
    rerender();

    expect(mocks.fetchConnectors).toHaveBeenCalledTimes(1);
    expect(mocks.fetchAgentBoundConnectors).toHaveBeenCalledTimes(1);
  });

  it('refetches both connector lists whenever the window regains focus', () => {
    mocks.workspaceId = 'ws-1';
    renderHook(() => useScopeAwareConnectorFetch());
    vi.clearAllMocks();

    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('focus'));

    expect(mocks.fetchConnectors).toHaveBeenCalledTimes(2);
    expect(mocks.fetchAgentBoundConnectors).toHaveBeenCalledTimes(2);
  });

  it('reports a failed return refresh instead of leaving an unhandled rejection', async () => {
    const errorToast = vi.spyOn(toast, 'error').mockImplementation(() => undefined);
    renderHook(() => useScopeAwareConnectorFetch());
    vi.clearAllMocks();
    mocks.fetchConnectors.mockRejectedValueOnce(new Error('network unavailable'));

    window.dispatchEvent(new Event('focus'));

    await waitFor(() => expect(errorToast).toHaveBeenCalledWith('tools.mcpPreset.refreshFailed'));
  });
});

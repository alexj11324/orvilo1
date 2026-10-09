/** @vitest-environment happy-dom */
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type PropsWithChildren } from 'react';
import { SWRConfig } from 'swr';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAgentDeviceCandidates, useDeviceList } from './useDeviceList';

const state = vi.hoisted(() => ({
  workspaceId: 'workspace-a' as string | undefined,
  query: vi.fn(),
}));
vi.mock('@/business/client/hooks/useActiveWorkspaceId', () => ({
  useActiveWorkspaceId: () => state.workspaceId,
}));
vi.mock('@/store/user', () => ({ useUserStore: () => true }));
vi.mock('@/services/device', () => ({
  deviceService: {
    listAgentCandidates: state.query,
    listDevices: async (scope?: string | null) => [{ deviceId: scope ?? state.workspaceId }],
  },
}));

const wrapper = ({ children }: PropsWithChildren) =>
  createElement(
    SWRConfig,
    {
      value: { provider: () => new Map(), revalidateOnFocus: false, revalidateOnReconnect: false },
    },
    children,
  );

beforeEach(() => {
  state.workspaceId = 'workspace-a';
  state.query.mockReset().mockImplementation(async ({ agentId }) => ({
    candidates: [{ deviceId: `${state.workspaceId}/${agentId}` }],
    inventoryComplete: true,
    inventoryState: 'complete',
  }));
});

describe('Agent device candidate cache', () => {
  it('keeps runtime evidence isolated when switching Agents and workspaces', async () => {
    const { result, rerender } = renderHook(({ agentId }) => useAgentDeviceCandidates(agentId), {
      initialProps: { agentId: 'agent-a' },
      wrapper,
    });
    await waitFor(() =>
      expect(result.current.data?.candidates[0].deviceId).toBe('workspace-a/agent-a'),
    );
    rerender({ agentId: 'agent-b' });
    await waitFor(() =>
      expect(result.current.data?.candidates[0].deviceId).toBe('workspace-a/agent-b'),
    );
    state.workspaceId = 'workspace-b';
    rerender({ agentId: 'agent-b' });
    await waitFor(() =>
      expect(result.current.data?.candidates[0].deviceId).toBe('workspace-b/agent-b'),
    );
  });

  it('surfaces discovery query failure and retries only on the explicit refresh', async () => {
    state.query.mockRejectedValueOnce(new Error('Gateway unavailable'));
    const { result } = renderHook(() => useAgentDeviceCandidates('agent-a'), { wrapper });
    await waitFor(() => expect(result.current.error?.message).toBe('Gateway unavailable'));
    expect(result.current.data).toBeUndefined();
    await act(async () => {
      await result.current.mutate();
    });
    await waitFor(() => expect(result.current.data?.inventoryComplete).toBe(true));
    expect(result.current.error).toBeUndefined();
  });

  it('disables runtime discovery without an Agent context', () => {
    const { result } = renderHook(() => useAgentDeviceCandidates(undefined), { wrapper });
    expect(result.current.data).toBeUndefined();
    expect(state.query).not.toHaveBeenCalled();
  });
});

it.each(['workspace-a', undefined])(
  'pins device discovery to the new workspace with active scope %s',
  async (active) => {
    state.workspaceId = active;
    const { result, rerender } = renderHook(({ scope }) => useDeviceList(scope), {
      initialProps: { scope: 'new-workspace' },
      wrapper,
    });
    await waitFor(() => expect(result.current.data?.[0].deviceId).toBe('new-workspace'));
    rerender({ scope: 'next-workspace' });
    await waitFor(() => expect(result.current.data?.[0].deviceId).toBe('next-workspace'));
  },
);

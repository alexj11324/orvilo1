import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as workspaceHooks from '@/business/client/hooks/useActiveWorkspaceId';
import { lambdaClient } from '@/libs/trpc/client';

import { useToolStore } from '../../store';
import { initialConnectorState } from './initialState';
import { connectorSelectors } from './selectors';

vi.mock('@/libs/trpc/client', () => ({
  lambdaClient: {
    connector: {
      list: { query: vi.fn() },
      listAgentBound: { query: vi.fn() },
      listByAgent: { query: vi.fn() },
    },
  },
}));

const listQuery = lambdaClient.connector.list.query as unknown as ReturnType<typeof vi.fn>;
const listAgentBoundQuery = lambdaClient.connector.listAgentBound.query as unknown as ReturnType<
  typeof vi.fn
>;
const listByAgentQuery = lambdaClient.connector.listByAgent.query as unknown as ReturnType<
  typeof vi.fn
>;

const connector = (identifier: string) => ({ id: identifier, identifier, tools: [] });

describe('createConnectorSlice — scope guard', () => {
  beforeEach(() => {
    useToolStore.setState({ ...initialConnectorState });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  // The connector list is workspace-scoped server-side but lands in one global
  // store bucket, so a response that resolves after the active scope moved on
  // must be dropped. Booting straight into a workspace URL is exactly that: the
  // tree mounts once in personal context before the URL→store sync resolves the
  // slug, so a personal query is already in flight when the workspace switch
  // fires its own — and the personal one landing last is what made a business
  // workspace list the user's PERSONAL tools.
  it('drops a fetchConnectors response that resolves after the scope changed', async () => {
    const wsSpy = vi.spyOn(workspaceHooks, 'getActiveWorkspaceId').mockReturnValue(null);
    listQuery.mockImplementation(async () => {
      wsSpy.mockReturnValue('ws-1');
      return [connector('personal-tool')];
    });

    const { result } = renderHook(() => useToolStore());
    await act(async () => {
      await result.current.fetchConnectors();
    });

    expect(useToolStore.getState().connectors).toEqual([]);
    expect(useToolStore.getState().isConnectorsInit).toBe(false);
  });

  it('writes a fetchConnectors response that resolves in the same scope', async () => {
    vi.spyOn(workspaceHooks, 'getActiveWorkspaceId').mockReturnValue('ws-1');
    listQuery.mockResolvedValue([connector('workspace-tool')]);

    const { result } = renderHook(() => useToolStore());
    await act(async () => {
      await result.current.fetchConnectors();
    });

    expect(useToolStore.getState().connectors.map((c) => c.identifier)).toEqual(['workspace-tool']);
    expect(useToolStore.getState().isConnectorsInit).toBe(true);
    expect(useToolStore.getState().connectorsScopeId).toBe('ws-1');
  });

  it('keeps a newer authorized connector when an older response arrives last', async () => {
    vi.spyOn(workspaceHooks, 'getActiveWorkspaceId').mockReturnValue('ws-1');
    let resolveOlder!: (value: ReturnType<typeof connector>[]) => void;
    let resolveNewer!: (value: ReturnType<typeof connector>[]) => void;
    listQuery
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOlder = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveNewer = resolve;
          }),
      );

    const older = useToolStore.getState().fetchConnectors();
    const newer = useToolStore.getState().fetchConnectors();
    resolveNewer([connector('linear-mcp-connected')]);
    await newer;
    resolveOlder([connector('linear-mcp-pending')]);
    await older;

    expect(useToolStore.getState().connectors.map((c) => c.identifier)).toEqual([
      'linear-mcp-connected',
    ]);
  });

  it('accepts an older successful load when the newer refresh failed', async () => {
    vi.spyOn(workspaceHooks, 'getActiveWorkspaceId').mockReturnValue('ws-1');
    let resolveOlder!: (value: ReturnType<typeof connector>[]) => void;
    listQuery
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOlder = resolve;
          }),
      )
      .mockRejectedValueOnce(new Error('temporary network failure'));

    const older = useToolStore.getState().fetchConnectors();
    await expect(useToolStore.getState().fetchConnectors()).rejects.toThrow(
      'temporary network failure',
    );
    resolveOlder([connector('linear-mcp')]);
    await older;

    expect(useToolStore.getState().connectors.map((c) => c.identifier)).toEqual(['linear-mcp']);
    expect(useToolStore.getState().isConnectorsInit).toBe(true);
  });

  it('keeps preset creation disabled while the next workspace list is delayed', async () => {
    const wsSpy = vi.spyOn(workspaceHooks, 'getActiveWorkspaceId').mockReturnValue(null);
    listQuery.mockResolvedValueOnce([connector('personal-tool')]);
    await useToolStore.getState().fetchConnectors();
    expect(connectorSelectors.isConnectorListReady(null)(useToolStore.getState())).toBe(true);

    let resolveWorkspace!: (value: ReturnType<typeof connector>[]) => void;
    listQuery.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveWorkspace = resolve;
        }),
    );
    wsSpy.mockReturnValue('ws-1');
    const pending = useToolStore.getState().fetchConnectors();
    expect(useToolStore.getState().isConnectorsInit).toBe(true);
    expect(connectorSelectors.isConnectorListReady('ws-1')(useToolStore.getState())).toBe(false);

    resolveWorkspace([connector('workspace-tool')]);
    await pending;
    expect(connectorSelectors.isConnectorListReady('ws-1')(useToolStore.getState())).toBe(true);
    expect(useToolStore.getState().connectors.map((c) => c.identifier)).toEqual(['workspace-tool']);
  });

  it('drops a fetchAgentBoundConnectors response that resolves after the scope changed', async () => {
    const wsSpy = vi.spyOn(workspaceHooks, 'getActiveWorkspaceId').mockReturnValue('ws-1');
    listAgentBoundQuery.mockImplementation(async () => {
      wsSpy.mockReturnValue(null);
      return [connector('agent-bound')];
    });

    const { result } = renderHook(() => useToolStore());
    await act(async () => {
      await result.current.fetchAgentBoundConnectors();
    });

    expect(useToolStore.getState().agentBoundConnectors).toEqual([]);
    expect(useToolStore.getState().isAgentBoundInit).toBe(false);
  });

  it('drops a fetchAgentConnectors response that resolves after the scope changed', async () => {
    const wsSpy = vi.spyOn(workspaceHooks, 'getActiveWorkspaceId').mockReturnValue('ws-1');
    listByAgentQuery.mockImplementation(async () => {
      wsSpy.mockReturnValue('ws-2');
      return [connector('agent-owned')];
    });

    const { result } = renderHook(() => useToolStore());
    await act(async () => {
      await result.current.fetchAgentConnectors('agt_1');
    });

    expect(useToolStore.getState().agentConnectors['agt_1']).toBeUndefined();
    expect(useToolStore.getState().agentConnectorsInit['agt_1']).toBeUndefined();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { getCacheScope } from '@/libs/swr/useCacheScope';
import { agentService } from '@/services/agent';

import { useAgentStore } from '../../store';

vi.mock('@/business/client/hooks/useActiveWorkspaceId', () => ({
  getActiveWorkspaceId: vi.fn(),
}));

vi.mock('@/libs/swr/useCacheScope', async (importOriginal) => {
  const original = await importOriginal<object>();
  return { ...original, getCacheScope: vi.fn() };
});

vi.mock('@/services/agent', () => ({
  agentService: { getBuiltinAgent: vi.fn() },
}));

const getBuiltinMock = vi.mocked(agentService.getBuiltinAgent);
const scopeMock = vi.mocked(getCacheScope);
const activeWorkspaceMock = vi.mocked(getActiveWorkspaceId);

beforeEach(() => {
  vi.clearAllMocks();
  useAgentStore.setState({ builtinAgentIdMap: {} });
  scopeMock.mockReturnValue('u-1:ws-1');
  activeWorkspaceMock.mockReturnValue('ws-1');
});

describe('refreshBuiltinAgent', () => {
  it('pins the builtin id when the row belongs to the active workspace', async () => {
    getBuiltinMock.mockResolvedValue({ id: 'agent-1', workspaceId: 'ws-1' } as never);

    await useAgentStore.getState().refreshBuiltinAgent('inbox');

    expect(useAgentStore.getState().builtinAgentIdMap.inbox).toBe('agent-1');
  });

  // The race this guards: a request can land on a different scope than the SWR
  // partition it writes back into (workspace switch mid-flight, or a header
  // slot that resolved later than the key). Builtin slugs are per-scope
  // singletons, so a mismatched workspaceId is definitively the wrong row.
  it('never pins a builtin row from a different workspace', async () => {
    getBuiltinMock.mockResolvedValue({ id: 'agent-foreign', workspaceId: 'ws-2' } as never);

    await useAgentStore.getState().refreshBuiltinAgent('inbox');

    expect(useAgentStore.getState().builtinAgentIdMap.inbox).toBeUndefined();
  });

  // Unfiled rows (workspaceId null) are the caller's own pre-workspace agents —
  // union scope semantics keep them readable after workspace activation, so
  // they must still pin instead of dead-ending the builtin slug.
  it("pins the caller's unfiled row under a workspace scope", async () => {
    getBuiltinMock.mockResolvedValue({ id: 'agent-unfiled', workspaceId: null } as never);

    await useAgentStore.getState().refreshBuiltinAgent('inbox');

    expect(useAgentStore.getState().builtinAgentIdMap.inbox).toBe('agent-unfiled');
  });
});

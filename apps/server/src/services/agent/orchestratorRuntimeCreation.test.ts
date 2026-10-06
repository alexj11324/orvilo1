import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveOrchestratorRuntimeForCreation } from './orchestratorRuntimeCreation';

const { readSource, readRuntime, access } = vi.hoisted(() => ({
  readSource: vi.fn(),
  readRuntime: vi.fn(),
  access: vi.fn(),
}));

vi.mock('@/database/models/agent', () => ({
  AgentModel: vi.fn(function () {
    return { getOrchestratorSourceAgentId: readSource, inheritRuntimeForCreation: readRuntime };
  }),
}));
vi.mock('@/server/routers/lambda/_helpers/resourceConfigGuard', () => ({
  getResourceConfigAccess: access,
}));

describe('Orchestrator source admission', () => {
  const actor = { db: {} as any, userId: 'member', workspaceId: 'workspace' };
  beforeEach(() => {
    vi.clearAllMocks();
    readSource.mockResolvedValue('chosen-source');
    access.mockResolvedValue('full');
    readRuntime.mockResolvedValue({ agencyConfig: { boundDeviceId: 'host' } });
  });

  it('checks current source permission before copying an explicit runtime', async () => {
    const runtime = await resolveOrchestratorRuntimeForCreation(actor, {
      sourceAgentId: 'explicit-source',
      visibility: 'private',
    });
    expect(readSource).not.toHaveBeenCalled();
    expect(access).toHaveBeenCalledWith(actor, 'agent', 'explicit-source');
    expect(access.mock.invocationCallOrder[0]).toBeLessThan(
      readRuntime.mock.invocationCallOrder[0],
    );
    expect(runtime.params.orchestratorSourceAgentId).toBe('explicit-source');
  });

  it.each(['profile', 'none'])('rejects %s access before reading source runtime', async (level) => {
    access.mockResolvedValue(level);
    await expect(
      resolveOrchestratorRuntimeForCreation(actor, { sourceAgentId: 'restricted-source' }),
    ).rejects.toThrow('Agent runtime configuration is unavailable');
    expect(readRuntime).not.toHaveBeenCalled();
  });

  it('rechecks the saved default when its config permission has been revoked', async () => {
    await resolveOrchestratorRuntimeForCreation(actor);
    readRuntime.mockClear();
    access.mockResolvedValue('profile');
    await expect(resolveOrchestratorRuntimeForCreation(actor)).rejects.toThrow(
      'Agent runtime configuration is unavailable',
    );
    expect(readRuntime).not.toHaveBeenCalled();
  });
});

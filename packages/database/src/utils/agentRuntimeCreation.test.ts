// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import type { OrviloDatabase } from '../type';
import { assertAgentRuntimeCreation } from './agentRuntimeCreation';

describe('saved Agent runtime requirements', () => {
  it('rejects an unset host for a public workspace Agent', async () => {
    await expect(
      assertAgentRuntimeCreation(
        {} as OrviloDatabase,
        { userId: 'member', workspaceId: 'workspace' },
        {
          agencyConfig: { heterogeneousProvider: { type: 'opencode', model: 'saved-model' } },
        },
      ),
    ).rejects.toMatchObject({ message: 'AGENT_HOST_REQUIRED' });
  });

  it.each([
    { type: 'opencode' as const },
    {
      type: 'opencode' as const,
      authMode: 'subscription' as const,
      apiConfig: { model: 'inactive-model', providerId: 'api-provider' },
    },
  ])(
    'rejects an unset effective model after validating the saved host',
    async (heterogeneousProvider) => {
      const query = { from: vi.fn(), where: vi.fn(), limit: vi.fn() };
      query.from.mockReturnValue(query);
      query.where.mockReturnValue(query);
      query.limit.mockResolvedValue([{ deviceId: 'saved-device' }]);
      const db = { select: vi.fn().mockReturnValue(query) } as unknown as OrviloDatabase;
      await expect(
        assertAgentRuntimeCreation(
          db,
          { userId: 'member', workspaceId: 'workspace' },
          {
            agencyConfig: {
              boundDeviceId: 'saved-device',
              executionTarget: 'device',
              heterogeneousProvider,
            },
          },
        ),
      ).rejects.toMatchObject({ message: 'AGENT_MODEL_REQUIRED' });
    },
  );
});

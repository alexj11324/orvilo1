// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { workspaceRouter } from '@/business/server/lambda-routers/workspace';

vi.mock('@/database/models/workspace', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/database/models/workspace')>()),
  getActiveWorkspaceMembershipRole: vi.fn().mockResolvedValue('member'),
}));

describe('workspaceRouter.getById', () => {
  it('returns null in the community build', async () => {
    const caller = workspaceRouter.createCaller({
      serverDB: {},
      userId: 'user-1',
      workspaceId: 'ignored-community-workspace',
    } as never);

    await expect(caller.getById()).resolves.toBeNull();
  });
});

// @vitest-environment node
import { TRPCError } from '@trpc/server';
import { beforeEach, expect, it, vi } from 'vitest';

import { slackIntegrationRouter } from '../slackIntegration';

const mocks = vi.hoisted(() => ({
  assertMember: vi.fn(),
  availableAgents: vi.fn(),
  bindings: vi.fn(),
  installation: vi.fn(),
}));
vi.mock('@/libs/trpc/lambda/middleware', () => ({
  serverDatabase: (opts: { ctx: unknown; next: (args: unknown) => unknown }) =>
    opts.next({ ctx: opts.ctx }),
}));
vi.mock('@/database/models/workspace', () => ({ hasWorkspaceAdminAccess: async () => false }));
vi.mock('@/database/models/slackIntegration', () => ({
  SlackIntegrationModel: class {
    installation = mocks.installation;
    bindings = mocks.bindings;
  },
}));
vi.mock('@/server/services/slackIntegration', () => ({
  createSlackIntegrationService: () => ({
    assertMember: mocks.assertMember,
    availableAgents: mocks.availableAgents,
  }),
}));
vi.mock('@/server/services/slackIntegration/channelsRuntime', () => ({
  stopSlackChannelsRuntime: vi.fn(),
}));
vi.mock('@/server/services/slackIntegration/oauthState', () => ({ readOAuthResult: vi.fn() }));
const caller = () => slackIntegrationRouter.createCaller({ userId: 'user', serverDB: {} } as never);
beforeEach(() => {
  vi.resetAllMocks();
  mocks.installation.mockResolvedValue(undefined);
  mocks.availableAgents.mockResolvedValue([{ id: 'allowed', name: 'Named Agent' }]);
  mocks.bindings.mockResolvedValue([
    {
      id: 'one',
      agentId: 'allowed',
      agentName: null,
      slackChannelId: 'C1',
      slackChannelName: 'general',
    },
    {
      id: 'two',
      agentId: 'private',
      agentName: 'Private secret',
      slackChannelId: 'C2',
      slackChannelName: 'private',
    },
  ]);
});
it('returns only allowed bindings and a non-null Agent display name', async () => {
  const response = await caller().status({ workspaceId: 'workspace' });
  expect(response.data.bindings).toEqual([
    {
      id: 'one',
      agentId: 'allowed',
      agentName: 'Named Agent',
      slackChannelId: 'C1',
      slackChannelName: 'general',
    },
  ]);
  expect(JSON.stringify(response)).not.toContain('Private secret');
});
it('rejects unauthorized input workspace before querying installation', async () => {
  mocks.assertMember.mockRejectedValue(new TRPCError({ code: 'FORBIDDEN' }));
  await expect(caller().status({ workspaceId: 'other' })).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
  expect(mocks.installation).not.toHaveBeenCalled();
});

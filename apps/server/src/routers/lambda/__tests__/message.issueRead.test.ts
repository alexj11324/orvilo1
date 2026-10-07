// @vitest-environment node
import { TRPCError } from '@trpc/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  assertCanUseTopicTargets,
  assertCanViewTopicTargets,
} from '../_helpers/conversationResourceGuard';
import { messageRouter } from '../message';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  configAccess: vi.fn().mockResolvedValue('profile'),
}));
vi.mock('../_helpers/resourceConfigGuard', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getResourceConfigAccess: mocks.configAccess,
}));
vi.mock('@/database/models/message', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  MessageModel: vi.fn(function () {
    return { query: mocks.query };
  }),
}));

vi.mock('@/database/core/db-adaptor', () => ({ getServerDB: vi.fn(() => ({})) }));
vi.mock('@/database/models/workspace', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getActiveWorkspaceMembershipRole: vi.fn().mockResolvedValue('member'),
}));
vi.mock('@/server/services/file', () => ({
  FileService: vi.fn(function () {
    return { getFileAccessUrl: vi.fn() };
  }),
}));
vi.mock('../_helpers/conversationResourceGuard', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  assertCanUseTopicTargets: vi.fn().mockRejectedValue(new TRPCError({ code: 'FORBIDDEN' })),
  assertCanViewTopicTargets: vi.fn().mockResolvedValue([]),
}));

afterEach(() => vi.restoreAllMocks());
describe('message Issue read boundary', () => {
  it.each(['none', 'profile'])(
    'projects runtime session metadata for a reader with config access %s',
    async (access) => {
      mocks.configAccess.mockResolvedValue(access);
      const transcript = [
        {
          id: 'message-runtime',
          agentId: 'foreign-agent',
          content: 'Shared answer',
          metadata: {
            heteroSessionId: 'fixture-native-session',
            heteroMessageId: 'fixture-native-message',
            model: 'codex',
            provider: 'subscription',
          },
          pluginState: { result: { content: 'pwd output retained' } },
          children: [
            {
              id: 'block-1',
              content: 'Tool summary',
              metadata: { heteroSessionId: 'fixture-child-session' },
            },
          ],
        },
      ];
      mocks.query.mockResolvedValue(transcript);
      const caller = messageRouter.createCaller({
        userId: 'reader',
        jwtPayload: { userId: 'reader' },
        workspaceId: 'workspace-1',
      } as never);
      const result = await caller.getMessages({ topicId: 'issue-topic' });
      expect(result).toMatchObject([
        {
          content: 'Shared answer',
          metadata: { model: 'codex', provider: 'subscription' },
          pluginState: { result: { content: 'pwd output retained' } },
          children: [{ content: 'Tool summary' }],
        },
      ]);
      expect(result[0]?.metadata).not.toHaveProperty('heteroSessionId');
      expect(result[0]?.metadata).not.toHaveProperty('heteroMessageId');
      expect(result[0]?.children?.[0]?.metadata).not.toHaveProperty('heteroSessionId');
    },
  );

  it('hydrates a View-only Issue conversation without requiring Agent Use', async () => {
    const transcript = [{ id: 'message-1', content: 'Shared Issue conversation' }];
    mocks.query.mockResolvedValue(transcript);
    const caller = messageRouter.createCaller({
      userId: 'reader',
      jwtPayload: { userId: 'reader' },
      workspaceId: 'workspace-1',
    } as never);
    expect(await caller.getMessages({ topicId: 'issue-topic' })).toEqual(transcript);
    expect(assertCanViewTopicTargets).toHaveBeenCalled();
    expect(assertCanUseTopicTargets).not.toHaveBeenCalled();
  });
});

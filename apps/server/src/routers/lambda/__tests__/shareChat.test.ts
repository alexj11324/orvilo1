// @vitest-environment node
import type * as BusinessConst from '@orvilo/business-const';
import { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as MessageModelModule from '@/database/models/message';
import { createContextInner } from '@/libs/trpc/lambda/context';

vi.mock('@/database/core/db-adaptor', () => ({
  getServerDB: vi.fn(function () {
    return {};
  }),
}));

// Pin the cloud-only capability open so the visitor procedures under test are
// reachable: ENABLE_BUSINESS_FEATURES is false in OSS builds, and the
// shareChatProcedure middleware (`_helpers/agentShareFeatureGate.ts`) would
// otherwise reject everything with FORBIDDEN before reaching any of the
// behavior these tests exercise. The "gate itself" is covered separately by
// `_helpers/__tests__/agentShareFeatureGate.test.ts` and the dedicated
// "visitor capability" describe block below.
const mocks = vi.hoisted(() => ({
  businessConst: { ENABLE_BUSINESS_FEATURES: true },
}));
vi.mock('@orvilo/business-const', async () => {
  const actual = await vi.importActual<typeof BusinessConst>('@orvilo/business-const');
  return {
    ...actual,
    // `packages/utils/src/apiKey.ts` reads this dynamically (`import * as
    // businessConst`), pulled in transitively via the unmocked
    // `createContextInner` -> `ApiKeyModel` chain below. `actual` here
    // resolves to the cloud override, which omits this key entirely (see
    // that file's own doc comment), so vitest's mock-export validation has
    // no own property to find unless it is listed explicitly.
    API_KEY_PREFIX: (actual as Record<string, unknown>).API_KEY_PREFIX,
    // A getter (not a static spread) so per-test mutation of
    // `mocks.businessConst.ENABLE_BUSINESS_FEATURES` is observed by every
    // subsequent read, including inside the already-imported gate helper.
    get ENABLE_BUSINESS_FEATURES() {
      return mocks.businessConst.ENABLE_BUSINESS_FEATURES;
    },
  };
});

const mockGetFeatureFlagsState = vi.fn();
vi.mock('@/server/featureFlags', () => ({
  getServerFeatureFlagsStateFromRuntimeConfig: (...args: unknown[]) =>
    mockGetFeatureFlagsState(...args),
}));

const mockAccessCheck = vi.fn();
vi.mock('@/database/models/agentShare', () => ({
  AgentShareModel: { findByShareIdWithAccessCheck: (...args: any[]) => mockAccessCheck(...args) },
}));

const mockFindById = vi.fn();
const mockCountBySender = vi.fn();
const mockQueryBySender = vi.fn();
const mockIsRunningOperationAlive = vi.fn();
const TopicModelMock = vi.fn(function () {
  return {
    countBySender: mockCountBySender,
    findById: mockFindById,
    isRunningOperationAlive: mockIsRunningOperationAlive,
    queryBySender: mockQueryBySender,
  };
});
vi.mock('@/database/models/topic', () => ({
  TopicModel: TopicModelMock,
}));

const mockMessageCountByTopic = vi.fn();
const mockMessageQuery = vi.fn();
const mockMessageQueryForVisitor = vi.fn();
vi.mock('@/database/models/message', async (importOriginal) => {
  // Keep the real `sanitizeVisitorError` (rather than re-stubbing it) so the
  // startup-error regression below exercises the SAME projection shareChat
  // reuses in production — not a test-only stand-in that could silently
  // drift from it.
  const actual = await importOriginal<typeof MessageModelModule>();
  return {
    ...actual,
    MessageModel: vi.fn(function () {
      return {
        countByTopic: mockMessageCountByTopic,
        query: mockMessageQuery,
        queryForVisitor: mockMessageQueryForVisitor,
      };
    }),
  };
});

vi.mock('@/database/models/user', () => ({
  UserModel: vi.fn(function () {
    return { getUserSettings: vi.fn().mockResolvedValue({}) };
  }),
}));

const mockExecAgent = vi.fn();
const mockInterruptTask = vi.fn();
const AiAgentServiceMock = vi.fn(function () {
  return {
    execAgent: mockExecAgent,
    interruptTask: mockInterruptTask,
  };
});
vi.mock('@/server/services/aiAgent', () => ({
  AiAgentService: AiAgentServiceMock,
}));

vi.mock('@/server/services/file', () => ({
  FileService: vi.fn(function () {
    return { getFileAccessUrl: vi.fn() };
  }),
}));

const mockSpendGate = vi.fn();
vi.mock('@/business/server/agent-share/spendGate', () => ({
  checkAgentShareSpendAllowance: (...args: any[]) => mockSpendGate(...args),
}));

const mockSignUserJWT = vi.fn();
vi.mock('@/libs/trpc/utils/internalJwt', () => ({
  signUserJWT: (...args: any[]) => mockSignUserJWT(...args),
}));

const { shareChatRouter } = await import('../shareChat');

const VISITOR = 'visitor-1';
const OWNER = 'owner-1';

const share = {
  agentId: 'agt_share',
  ownerId: OWNER,
  shareConfig: {
    allowReadMemory: false,
    toolGrants: [],
    maxTopicsPerVisitor: 2,
    maxTurnsPerTopic: 3,
  },
  shareId: 'share-1',
  visibility: 'link',
};

const visitorTopic = {
  agentId: share.agentId,
  id: 'tpc_visitor',
  metadata: { runningOperation: { operationId: 'op-1' } },
  senderId: VISITOR,
};

const createCaller = async () =>
  shareChatRouter.createCaller(await createContextInner({ userId: VISITOR }));

describe('shareChatRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.businessConst.ENABLE_BUSINESS_FEATURES = true;
    mockGetFeatureFlagsState.mockResolvedValue({ enableAgentShare: true });
    mockAccessCheck.mockResolvedValue(share);
    mockFindById.mockResolvedValue(visitorTopic);
    mockIsRunningOperationAlive.mockResolvedValue(true);
    mockCountBySender.mockResolvedValue(0);
    mockQueryBySender.mockResolvedValue([]);
    mockMessageCountByTopic.mockResolvedValue(0);
    mockMessageQuery.mockResolvedValue([]);
    mockExecAgent.mockResolvedValue({ operationId: 'op-1', success: true });
    mockInterruptTask.mockResolvedValue({ operationId: 'op-1', success: true });
    mockSignUserJWT.mockResolvedValue('visitor-jwt');
    mockSpendGate.mockResolvedValue({ allowed: true });
  });

  describe('execAgent', () => {
    // Visitor execution is retired (product plan §6.5). This entry point is the
    // only way to start a share-visitor run, so refusing it is the complete
    // gate — and it has to refuse before the share is resolved, so that nothing
    // about a share's existence, visibility or the owner's spend is observable
    // to a caller.
    //
    // The behaviours this block used to pin down — spend admission, the
    // per-visitor topic and turn caps, creator-scoped dispatch carrying the
    // share gate, prompt-size bounds, failure redaction, and the
    // `interactiveStart: false` liveness contract — are all downstream of a run
    // that can no longer start. They are listed in the rollout doc so that
    // re-opening the capability restores both the code and this coverage.
    it('refuses before any share lookup, spend check or dispatch', async () => {
      const caller = await createCaller();

      await expect(caller.execAgent({ prompt: 'hi', shareId: 'share-1' })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });

      expect(mockAccessCheck).not.toHaveBeenCalled();
      expect(mockSpendGate).not.toHaveBeenCalled();
      expect(mockExecAgent).not.toHaveBeenCalled();
    });
  });

  describe('interruptTask', () => {
    it('interrupts a running operation that matches the topic ownership and running marker', async () => {
      const caller = await createCaller();

      await expect(
        caller.interruptTask({ operationId: 'op-1', shareId: 'share-1', topicId: 'tpc_visitor' }),
      ).resolves.toMatchObject({ operationId: 'op-1', success: true });

      // Service runs as the CREATOR — the run's operation/thread rows live there.
      expect(AiAgentServiceMock).toHaveBeenCalledWith(expect.anything(), OWNER, {
        includeShareVisitor: true,
      });
      expect(mockInterruptTask).toHaveBeenCalledWith({
        operationId: 'op-1',
        topicId: 'tpc_visitor',
      });
    });

    it("fails closed when the topic is not the visitor's own share topic", async () => {
      mockFindById.mockResolvedValue({ ...visitorTopic, senderId: 'someone-else' });
      const caller = await createCaller();

      await expect(
        caller.interruptTask({ operationId: 'op-1', shareId: 'share-1', topicId: 'tpc_visitor' }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(mockInterruptTask).not.toHaveBeenCalled();
    });

    it('rejects an operationId that does not match the topic’s current running operation', async () => {
      const caller = await createCaller();

      await expect(
        caller.interruptTask({
          operationId: 'op-someone-elses',
          shareId: 'share-1',
          topicId: 'tpc_visitor',
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(mockInterruptTask).not.toHaveBeenCalled();
    });

    it('rejects when the topic has no running operation at all', async () => {
      mockFindById.mockResolvedValue({ ...visitorTopic, metadata: {} });
      const caller = await createCaller();

      await expect(
        caller.interruptTask({ operationId: 'op-1', shareId: 'share-1', topicId: 'tpc_visitor' }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(mockInterruptTask).not.toHaveBeenCalled();
    });

    // Regression for Codex P2: same startup-failure redaction as
    // `execAgent` — `AiAgentService.interruptTask` also runs creator-scoped
    // and can throw a raw infra/provider diagnostic before any Gateway event
    // exists to sanitize.
    it('redacts a diagnostic interrupt failure instead of leaking it to the visitor', async () => {
      const diagnostic = new Error(
        'pg driver error: relation "operations_internal" does not exist',
      );
      mockInterruptTask.mockRejectedValueOnce(diagnostic);
      const caller = await createCaller();

      const rejection = caller.interruptTask({
        operationId: 'op-1',
        shareId: 'share-1',
        topicId: 'tpc_visitor',
      });
      await expect(rejection).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
      await rejection.catch((error: any) => {
        expect(error.message).not.toContain('operations_internal');
        expect(error.message).not.toContain('pg driver');
      });
    });
  });

  describe('getTopics', () => {
    it("returns only the visitor's own topics via agentId + senderId scoping", async () => {
      const caller = await createCaller();
      await caller.getTopics({ shareId: 'share-1' });

      // Topic model is creator-scoped; the query narrows to this visitor's own
      // topics on this agent. `agent_shares` is 1:1 per agent, so `(agentId,
      // senderId)` unambiguously identifies the share conversation without a
      // share-instance column on `topics`.
      expect(TopicModelMock).toHaveBeenCalledWith(expect.anything(), OWNER, undefined, undefined, {
        includeShareVisitor: true,
      });
      expect(mockQueryBySender).toHaveBeenCalledWith({
        agentId: share.agentId,
        senderId: VISITOR,
      });
    });

    it('does not tie the list page size to the live maxTopicsPerVisitor cap', async () => {
      // The cap only gates admission of NEW topics. A creator lowering it below
      // what a visitor already created must not hide those older conversations —
      // the visitor surface has no pagination or deep links to recover them.
      mockAccessCheck.mockResolvedValue({
        ...share,
        shareConfig: { ...share.shareConfig, maxTopicsPerVisitor: 1 },
      });
      const caller = await createCaller();
      await caller.getTopics({ shareId: 'share-1' });

      expect(mockQueryBySender).toHaveBeenCalledWith({
        agentId: share.agentId,
        senderId: VISITOR,
      });
    });
  });

  describe('getMessages', () => {
    it('rejects a topic on a different agent of the same creator', async () => {
      mockFindById.mockResolvedValue({ ...visitorTopic, agentId: 'agt_other' });
      const caller = await createCaller();

      await expect(
        caller.getMessages({ shareId: 'share-1', topicId: 'tpc_visitor' }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(mockMessageQueryForVisitor).not.toHaveBeenCalled();
    });

    it('serves messages without Work summaries', async () => {
      const caller = await createCaller();
      await caller.getMessages({ shareId: 'share-1', topicId: 'tpc_visitor' });

      expect(mockMessageQueryForVisitor).toHaveBeenCalledWith(
        { skipWorks: true, topicId: 'tpc_visitor' },
        expect.objectContaining({
          redaction: {
            showErrorDetails: undefined,
            showModelInfo: undefined,
          },
        }),
      );
    });

    it('uses the visitor-redacted read path, never the raw creator-scoped query()', async () => {
      // Regression: getMessages must call `queryForVisitor` (which strips the
      // creator's sender/spend fields), not `query()` — see message.ts
      // `toVisitorMessage` for what that redaction guards against.
      const caller = await createCaller();
      await caller.getMessages({ shareId: 'share-1', topicId: 'tpc_visitor' });

      expect(mockMessageQuery).not.toHaveBeenCalled();
    });
  });

  describe('issueGatewayUserToken', () => {
    it('signs the per-user hub token for the VISITOR, never the creator', async () => {
      const caller = await createCaller();

      await expect(caller.issueGatewayUserToken({ shareId: 'share-1' })).resolves.toEqual({
        token: 'visitor-jwt',
      });
      expect(mockSignUserJWT).toHaveBeenCalledWith(VISITOR);
      expect(mockAccessCheck).toHaveBeenCalledWith(expect.anything(), 'share-1', VISITOR);
    });

    // The v2 hub socket is per user, not per operation: the hub authorizes
    // each `subscribe` against the op's registered owner, so minting must not
    // depend on a topic marker or a live run (a visitor opens the socket
    // before their first send).
    it('does not require a topic or a running operation', async () => {
      mockFindById.mockResolvedValue(undefined);
      mockIsRunningOperationAlive.mockResolvedValue(false);
      const caller = await createCaller();

      await expect(caller.issueGatewayUserToken({ shareId: 'share-1' })).resolves.toEqual({
        token: 'visitor-jwt',
      });
      expect(mockFindById).not.toHaveBeenCalled();
      expect(mockIsRunningOperationAlive).not.toHaveBeenCalled();
    });

    it('rejects an unknown share without signing anything', async () => {
      mockAccessCheck.mockRejectedValue(
        new TRPCError({ code: 'NOT_FOUND', message: 'Share not found' }),
      );
      const caller = await createCaller();

      await expect(caller.issueGatewayUserToken({ shareId: 'missing' })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
      expect(mockSignUserJWT).not.toHaveBeenCalled();
    });

    it('rejects a share that is not link-visible', async () => {
      mockAccessCheck.mockResolvedValue({ ...share, visibility: 'private' });
      const caller = await createCaller();

      await expect(caller.issueGatewayUserToken({ shareId: 'share-1' })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      expect(mockSignUserJWT).not.toHaveBeenCalled();
    });
  });

  describe('refreshGatewayToken', () => {
    it('signs the token for the VISITOR, never the creator', async () => {
      const caller = await createCaller();

      await expect(
        caller.refreshGatewayToken({ shareId: 'share-1', topicId: 'tpc_visitor' }),
      ).resolves.toEqual({ token: 'visitor-jwt' });
      expect(mockSignUserJWT).toHaveBeenCalledWith(VISITOR);
    });

    it('rejects when the topic has no running operation', async () => {
      mockFindById.mockResolvedValue({ ...visitorTopic, metadata: {} });
      const caller = await createCaller();

      await expect(
        caller.refreshGatewayToken({ shareId: 'share-1', topicId: 'tpc_visitor' }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(mockSignUserJWT).not.toHaveBeenCalled();
    });

    // The marker is cleared best-effort at finish, so a stale one must not
    // send the visitor's browser to reconnect to a finished run (it would
    // register the topic as "running" locally and freeze its message list).
    it('rejects when the marker points at a run that already ended', async () => {
      mockIsRunningOperationAlive.mockResolvedValue(false);
      const caller = await createCaller();

      await expect(
        caller.refreshGatewayToken({ shareId: 'share-1', topicId: 'tpc_visitor' }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(mockIsRunningOperationAlive).toHaveBeenCalledWith(
        expect.anything(),
        visitorTopic.metadata.runningOperation,
      );
      expect(mockSignUserJWT).not.toHaveBeenCalled();
    });
  });

  it('requires authentication', async () => {
    const caller = shareChatRouter.createCaller(await createContextInner());

    await expect(caller.getTopics({ shareId: 'share-1' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  describe('visitor capability', () => {
    it('rejects on a deployment without business features, before any share lookup', async () => {
      mocks.businessConst.ENABLE_BUSINESS_FEATURES = false;
      const caller = await createCaller();

      await expect(caller.getTopics({ shareId: 'share-1' })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      expect(mockAccessCheck).not.toHaveBeenCalled();
    });

    it.each([false, undefined])(
      'admits the retained visitor procedures when the agent share flag is %s',
      async (enableAgentShare) => {
        mockGetFeatureFlagsState.mockResolvedValue({ enableAgentShare });
        mockMessageQueryForVisitor.mockResolvedValue([]);
        const caller = await createCaller();

        await expect(caller.getTopics({ shareId: 'share-1' })).resolves.toEqual([]);
        await expect(
          caller.getMessages({ shareId: 'share-1', topicId: 'tpc_visitor' }),
        ).resolves.toEqual([]);
        await expect(
          caller.interruptTask({ operationId: 'op-1', shareId: 'share-1', topicId: 'tpc_visitor' }),
        ).resolves.toMatchObject({ success: true });
        await expect(
          caller.refreshGatewayToken({ shareId: 'share-1', topicId: 'tpc_visitor' }),
        ).resolves.toEqual({ token: 'visitor-jwt' });
        await expect(caller.issueGatewayUserToken({ shareId: 'share-1' })).resolves.toEqual({
          token: 'visitor-jwt',
        });

        // Starting a run is the one procedure the flag cannot re-open: it is
        // retired outright rather than rollout-gated, which is also why the
        // assertion below about the flag never being read still holds.
        await expect(caller.execAgent({ prompt: 'hi', shareId: 'share-1' })).rejects.toMatchObject({
          code: 'FORBIDDEN',
        });

        expect(mockGetFeatureFlagsState).not.toHaveBeenCalled();
      },
    );
  });
});

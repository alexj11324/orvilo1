// @vitest-environment node
import { type OrviloDatabase } from '@orvilo/database';
import {
  agentOperations,
  agents,
  resourcePermissions,
  tasks,
  taskTopics,
  topics,
  workspaceMembers,
  workspaces,
} from '@orvilo/database/schemas';
import { getTestDB } from '@orvilo/database/test-utils';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { aiAgentRouter } from '../aiAgent';
import { cleanupTestUser, createTestUser } from './integration/setup';

let testDB: OrviloDatabase;
vi.mock('@/database/core/db-adaptor', () => ({
  getServerDB: vi.fn(function () {
    return testDB;
  }),
}));

const mockGetOperationStatus = vi.fn();
const mockGetPendingInterventions = vi.fn();
vi.mock('@/server/services/agentExecution', () => ({
  AgentRuntimeService: vi.fn().mockImplementation(function () {
    return {
      getOperationStatus: mockGetOperationStatus,
      getPendingInterventions: mockGetPendingInterventions,
    };
  }),
}));

vi.mock('@/server/services/aiAgent', () => ({
  AiAgentService: vi.fn().mockImplementation(function () {
    return {
      // The middleware builds ctx.agentRuntimeService through this facade —
      // hand back the same mocked surface the bare constructor used to.
      createIsolatedRuntime: vi.fn(function () {
        return {
          getOperationStatus: mockGetOperationStatus,
          getPendingInterventions: mockGetPendingInterventions,
        };
      }),
    };
  }),
}));

vi.mock('@/server/services/aiChat', () => ({
  AiChatService: vi.fn().mockImplementation(function () {
    return {};
  }),
}));

/**
 * Operation ids are creator-scoped but, since Agent Share, are handed to a
 * DIFFERENT user (the visitor) so they can attach to the redacted Gateway
 * stream. These read endpoints return the raw, unredacted operation metadata
 * from the coordinator, so the id alone must never be enough to read them.
 */
describe('aiAgentRouter operation read guard', () => {
  let serverDB: OrviloDatabase;
  let ownerId: string;
  let visitorId: string;
  let operationId: string;

  beforeEach(async () => {
    serverDB = await getTestDB();
    testDB = serverDB;
    ownerId = await createTestUser(serverDB);
    visitorId = await createTestUser(serverDB);
    operationId = `op-share-run-${crypto.randomUUID()}`;

    await serverDB.insert(agentOperations).values({
      id: operationId,
      model: 'gpt-4o-mini',
      provider: 'openai',
      status: 'running',
      userId: ownerId,
    });

    mockGetOperationStatus.mockReset().mockResolvedValue({ metadata: { agentConfig: {} } });
    mockGetPendingInterventions.mockReset().mockResolvedValue({ pendingInterventions: [] });
  });

  afterEach(async () => {
    await serverDB.delete(agentOperations).where(eq(agentOperations.id, operationId));
    await cleanupTestUser(serverDB, visitorId);
    await cleanupTestUser(serverDB, ownerId);
    vi.clearAllMocks();
  });

  const callerFor = (userId: string, workspaceId?: string) =>
    aiAgentRouter.createCaller({ jwtPayload: { userId }, userId, workspaceId } as any);

  const linkWorkspaceIssue = async () => {
    const workspaceId = `issue-read-${crypto.randomUUID()}`;
    const agentId = `agent-${operationId}`;
    const topicId = `topic-${operationId}`;
    const taskId = `task-${operationId}`;
    await serverDB
      .insert(workspaces)
      .values({ id: workspaceId, name: 'Issue reads', slug: workspaceId, primaryOwnerId: ownerId });
    await serverDB.insert(workspaceMembers).values([
      { workspaceId, userId: ownerId, role: 'owner' },
      { workspaceId, userId: visitorId, role: 'member' },
    ]);
    await serverDB
      .insert(agents)
      .values({ id: agentId, slug: agentId, userId: ownerId, workspaceId, visibility: 'private' });
    await serverDB.insert(tasks).values({
      id: taskId,
      identifier: 'IR-1',
      seq: 1,
      instruction: 'Public workspace Issue',
      createdByUserId: ownerId,
      workspaceId,
      assigneeAgentId: agentId,
      visibility: 'private',
    });
    await serverDB.insert(topics).values({ id: topicId, userId: ownerId, workspaceId, agentId });
    await serverDB.insert(taskTopics).values({
      taskId,
      topicId,
      userId: ownerId,
      workspaceId,
      visibility: 'private',
      seq: 1,
      operationId,
    });
    await serverDB
      .update(agentOperations)
      .set({ workspaceId, taskId, topicId, agentId })
      .where(eq(agentOperations.id, operationId));
    return { workspaceId, topicId, agentId };
  };

  describe('getOperationStatus', () => {
    it('lets the owner read their own operation', async () => {
      const result = await callerFor(ownerId).getOperationStatus({ operationId });

      expect(result).toEqual({ metadata: { agentConfig: {} } });
      expect(mockGetOperationStatus).toHaveBeenCalledWith(expect.objectContaining({ operationId }));
    });

    it('rejects a share visitor holding the creator-scoped operation id', async () => {
      await expect(callerFor(visitorId).getOperationStatus({ operationId })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });

      expect(mockGetOperationStatus).not.toHaveBeenCalled();
    });

    // Share runs execute under the CREATOR's userId inside a visitor topic
    // (`topics.senderId`), so plain ownership would let the creator read the
    // visitor's run — the same exclusion `findOwnOperationById` applies.
    it('hides a visitor-topic operation from its creator-owner', async () => {
      const [topic] = await serverDB
        .insert(topics)
        .values({ senderId: visitorId, title: 'visitor chat', userId: ownerId })
        .returning();
      await serverDB
        .update(agentOperations)
        .set({ topicId: topic.id })
        .where(eq(agentOperations.id, operationId));

      await expect(callerFor(ownerId).getOperationStatus({ operationId })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
      await expect(
        callerFor(ownerId).getPendingInterventions({ operationId }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });

      expect(mockGetOperationStatus).not.toHaveBeenCalled();
      expect(mockGetPendingInterventions).not.toHaveBeenCalled();
    });

    it('rejects an unknown operation id without touching the runtime', async () => {
      await expect(
        callerFor(ownerId).getOperationStatus({ operationId: 'op-does-not-exist' }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });

      expect(mockGetOperationStatus).not.toHaveBeenCalled();
    });
  });

  describe('workspace Issue readonly operation responses', () => {
    it('redacts foreign Agent executable metadata for the operation owner with Use but no Manage', async () => {
      const { workspaceId, agentId } = await linkWorkspaceIssue();
      await serverDB.insert(resourcePermissions).values({
        resourceType: 'agent',
        resourceId: agentId,
        workspaceId,
        userId: visitorId,
        createdBy: ownerId,
        accessLevel: 'use',
      });
      await serverDB
        .update(agentOperations)
        .set({ userId: visitorId })
        .where(eq(agentOperations.id, operationId));
      mockGetOperationStatus.mockResolvedValueOnce({
        operationId,
        currentState: {
          status: 'waiting_for_human',
          stepCount: 1,
          lastModified: 'now',
          pendingHumanPrompt: { prompt: 'Choose', metadata: { requestId: 'own-question' } },
        },
        isActive: true,
        hasError: false,
        isCompleted: false,
        needsHumanInput: true,
        stats: {},
        metadata: {
          agentConfig: {
            id: agentId,
            title: 'Runner',
            systemRole: 'private-system-role',
            agencyConfig: {
              heterogeneousProvider: { type: 'codex', env: { TOKEN: 'fixture-private-env' } },
            },
          },
          modelRuntimeConfig: { apiKey: 'fixture-private-env' },
          tools: ['private-tool'],
        },
        executionHistory: [{ message: 'Own conversation history' }],
        recentEvents: [{ text: 'Own event' }],
      });
      const result = await callerFor(visitorId, workspaceId).getOperationStatus({
        operationId,
        includeHistory: true,
      });
      expect(result).toMatchObject({
        executionHistory: [{ message: 'Own conversation history' }],
        recentEvents: [{ text: 'Own event' }],
        currentState: {
          pendingHumanPrompt: { prompt: 'Choose', metadata: { requestId: 'own-question' } },
        },
        metadata: { agentConfig: { id: agentId, title: 'Runner' } },
      });
      expect(result).not.toHaveProperty('metadata.modelRuntimeConfig');
      expect(result).not.toHaveProperty('metadata.tools');
      expect(JSON.stringify(result)).not.toContain('fixture-private-env');
      expect(JSON.stringify(result)).not.toContain('private-system-role');
      mockGetPendingInterventions.mockResolvedValueOnce({
        pendingInterventions: [
          {
            operationId,
            type: 'human_prompt',
            status: 'waiting_for_human',
            stepCount: 1,
            lastModified: 'now',
            pendingHumanPrompt: { prompt: 'Choose', metadata: { requestId: 'own-question' } },
            modelRuntimeConfig: { apiKey: 'fixture-private-env' },
          },
        ],
        totalCount: 1,
        timestamp: 'now',
      });
      const pending = await callerFor(visitorId, workspaceId).getPendingInterventions({
        operationId,
      });
      expect(pending.pendingInterventions[0]?.pendingHumanPrompt).toEqual({
        prompt: 'Choose',
        metadata: { requestId: 'own-question' },
      });
      expect(pending.pendingInterventions[0]).not.toHaveProperty('modelRuntimeConfig');
      mockGetPendingInterventions.mockResolvedValueOnce({
        ...pending,
        pendingInterventions: [
          {
            ...pending.pendingInterventions[0],
            modelRuntimeConfig: { apiKey: 'fixture-private-env' },
          },
        ],
      });
      const ownListing = await callerFor(visitorId, workspaceId).getPendingInterventions({
        userId: visitorId,
      });
      expect(ownListing.pendingInterventions[0]).not.toHaveProperty('modelRuntimeConfig');
      expect(ownListing.pendingInterventions[0]?.pendingHumanPrompt).toEqual({
        prompt: 'Choose',
        metadata: { requestId: 'own-question' },
      });
    });

    it('retains full metadata for an operation owner who manages their own workspace Agent', async () => {
      const { workspaceId } = await linkWorkspaceIssue();
      const ownStatus = {
        metadata: {
          agentConfig: { systemRole: 'own-system-role' },
          modelRuntimeConfig: { apiKey: 'own-config-fixture' },
        },
      };
      mockGetOperationStatus.mockResolvedValueOnce(ownStatus);
      expect(await callerFor(ownerId, workspaceId).getOperationStatus({ operationId })).toEqual(
        ownStatus,
      );
    });

    it('reads live status and question without executor config, history or raw events', async () => {
      const { workspaceId } = await linkWorkspaceIssue();
      mockGetOperationStatus.mockResolvedValueOnce({
        operationId,
        currentState: {
          status: 'waiting_for_human',
          stepCount: 2,
          lastModified: '2026-10-06',
          pendingHumanPrompt: { prompt: 'Which option?', metadata: { apiKey: 'fixture-only' } },
        },
        needsHumanInput: true,
        isActive: true,
        hasError: false,
        isCompleted: false,
        stats: { totalSteps: 2 },
        metadata: {
          agentConfig: {
            id: 'executor',
            title: 'Executor',
            systemRole: 'private prompt',
            agencyConfig: {
              heterogeneousProvider: { type: 'codex', env: { TOKEN: 'fixture-only' } },
            },
          },
          modelRuntimeConfig: { apiKey: 'fixture-only' },
        },
        executionHistory: [{ newState: { agentConfig: { systemRole: 'private prompt' } } }],
        recentEvents: [{ modelRuntimeConfig: { apiKey: 'fixture-only' } }],
      });
      const result = await callerFor(visitorId, workspaceId).getOperationStatus({
        operationId,
        includeHistory: true,
      });
      expect(result).toMatchObject({
        operationId,
        isActive: true,
        needsHumanInput: true,
        currentState: {
          status: 'waiting_for_human',
          pendingHumanPrompt: { prompt: 'Which option?' },
        },
        metadata: { agentConfig: { id: 'executor', title: 'Executor' } },
      });
      expect(result).not.toHaveProperty('metadata.modelRuntimeConfig');
      expect(result).not.toHaveProperty('executionHistory');
      expect(result).not.toHaveProperty('recentEvents');
      expect(JSON.stringify(result)).not.toContain('fixture-only');
      expect(JSON.stringify(result)).not.toContain('private prompt');
      expect(
        (
          await serverDB.select().from(agentOperations).where(eq(agentOperations.id, operationId))
        )[0]?.status,
      ).toBe('running');
    });

    it('reads pending questions without model credentials and never resolves them', async () => {
      const { workspaceId } = await linkWorkspaceIssue();
      mockGetPendingInterventions.mockResolvedValueOnce({
        pendingInterventions: [
          {
            operationId,
            status: 'waiting_for_human',
            type: 'human_prompt',
            stepCount: 2,
            lastModified: '2026-10-06',
            pendingHumanPrompt: { prompt: 'Which option?', metadata: { apiKey: 'fixture-only' } },
            modelRuntimeConfig: { apiKey: 'fixture-only' },
          },
        ],
        totalCount: 1,
        timestamp: '2026-10-06',
      });
      const result = await callerFor(visitorId, workspaceId).getPendingInterventions({
        operationId,
      });
      expect(result).toMatchObject({
        totalCount: 1,
        pendingInterventions: [{ operationId, pendingHumanPrompt: { prompt: 'Which option?' } }],
      });
      expect(JSON.stringify(result)).not.toContain('fixture-only');
      expect(
        (
          await serverDB.select().from(agentOperations).where(eq(agentOperations.id, operationId))
        )[0]?.status,
      ).toBe('running');
    });
  });

  describe('getPendingInterventions', () => {
    it('rejects a foreign operation id', async () => {
      await expect(
        callerFor(visitorId).getPendingInterventions({ operationId }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });

      expect(mockGetPendingInterventions).not.toHaveBeenCalled();
    });

    it("refuses to list another user's operations by userId", async () => {
      await expect(
        callerFor(visitorId).getPendingInterventions({ userId: ownerId }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });

      expect(mockGetPendingInterventions).not.toHaveBeenCalled();
    });

    it("lists only the caller's own operations", async () => {
      await callerFor(ownerId).getPendingInterventions({ userId: ownerId });

      expect(mockGetPendingInterventions).toHaveBeenCalledWith({
        operationId: undefined,
        userId: ownerId,
      });
    });
  });
});

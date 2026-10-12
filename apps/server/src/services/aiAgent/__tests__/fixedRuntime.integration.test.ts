// @vitest-environment node
import type { OrviloDatabase } from '@orvilo/database';
import {
  agents,
  users,
  workspaceMembers,
  workspaces,
  workspaceUserSettings,
} from '@orvilo/database/schemas';
import { getTestDB } from '@orvilo/database/test-utils';
import { eq } from 'drizzle-orm';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';

import { AgentModel } from '@/database/models/agent';

import { resolveRunAgentConfig } from '../pipeline/resolveRunAgentConfig';

vi.mock('@/database/models/user', () => ({
  UserModel: { getInfoForAIGeneration: vi.fn().mockResolvedValue({}) },
}));
vi.mock('@/server/services/resourcePermission', () => ({
  isResourceAuthorOrAdmin: vi.fn().mockResolvedValue(false),
}));

let db: OrviloDatabase;
const workspaceId = 'fixed-runtime-workspace';
const agentId = 'fixed-runtime-agent';
const memberIds = ['fixed-runtime-member-1', 'fixed-runtime-member-2'];
const ownerId = 'fixed-runtime-owner';

beforeAll(async () => {
  db = await getTestDB();
}, 120_000);

beforeEach(async () => {
  await db.insert(users).values([ownerId, ...memberIds].map((id) => ({ id })));
  await db
    .insert(workspaces)
    .values({ id: workspaceId, name: 'Fixed runtime', slug: workspaceId, primaryOwnerId: ownerId });
  await db
    .insert(workspaceMembers)
    .values(memberIds.map((userId) => ({ workspaceId, userId, role: 'member' as const })));
  await db.insert(agents).values({
    id: agentId,
    userId: ownerId,
    workspaceId,
    visibility: 'public',
    model: 'saved-model',
    provider: 'saved-provider',
    agencyConfig: {
      boundDeviceId: 'saved-device',
      executionTarget: 'device',
      heterogeneousProvider: { type: 'opencode' },
    },
  });
  // Real obsolete rows prove that persisted member choices have no effect.
  await db.insert(workspaceUserSettings).values(
    memberIds.map((userId, index) => ({
      userId,
      workspaceId,
      preference: {
        agentDeviceOverrides: {
          [agentId]: { boundDeviceId: `member-device-${index}`, executionTarget: 'device' },
        },
        agentModelOverrides: {
          [agentId]: { model: `member-model-${index}`, provider: 'member-provider' },
        },
        agentModeOverrides: { [agentId]: false },
      } as never,
    })),
  );
});

afterEach(async () => {
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  for (const userId of [ownerId, ...memberIds]) await db.delete(users).where(eq(users.id, userId));
});

it('resolves one saved Agent runtime for two members with conflicting persisted choices', async () => {
  for (const userId of memberIds) {
    const agentModel = new AgentModel(db, userId, workspaceId);
    const { agentConfig } = await resolveRunAgentConfig(
      {
        db,
        userId,
        workspaceId,
        resolveAgentConfigOrThrow: async (id) => {
          const config = await agentModel.getAgentConfigForExecution(id);
          if (!config) throw new Error('Agent missing');
          return config;
        },
      },
      { identifier: agentId, throwIfExecutionAborted: async () => {} },
    );
    expect(agentConfig).toMatchObject({
      model: 'saved-model',
      provider: 'saved-provider',
      agencyConfig: { boundDeviceId: 'saved-device', executionTarget: 'device' },
      chatConfig: { enableAgentMode: false },
    });
  }
});

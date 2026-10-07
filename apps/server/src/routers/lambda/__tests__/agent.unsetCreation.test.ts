// @vitest-environment node
import type { OrviloDatabase } from '@orvilo/database';
import {
  agents,
  devices,
  resourcePermissions,
  users,
  workspaceMembers,
  workspaces,
} from '@orvilo/database/schemas';
import { getTestDB } from '@orvilo/database/test-utils';
import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { assertAgentRuntimeCreation } from '@/database/utils/agentRuntimeCreation';

import { agentRouter } from '../agent';

let db: OrviloDatabase;
vi.mock('@/database/core/db-adaptor', () => ({ getServerDB: () => db }));
// The transport is authenticated here; real RPC schema, models, membership and grants run.
vi.mock('@/business/server/trpc-middlewares/workspaceAuth', async (importOriginal) => {
  const original = await importOriginal<object>();
  const { trpc } = await import('@/libs/trpc/lambda/init');
  return { ...original, wsCompatProcedure: trpc.procedure };
});

const owner = 'unset-create-owner';
const member = 'unset-create-member';
const workspaceId = 'unset-create-workspace';
const provider = {
  type: 'claude-code' as const,
  authMode: 'subscription' as const,
  model: 'default',
  args: ['--model', 'default'],
};
const caller = (userId = owner, scope: string | undefined = workspaceId) =>
  agentRouter.createCaller({ serverDB: db, userId, workspaceId: scope } as never);

beforeEach(async () => {
  db = await getTestDB();
  await db.insert(users).values([{ id: owner }, { id: member }]);
  await db.insert(workspaces).values({
    id: workspaceId,
    slug: workspaceId,
    name: 'Unset creation fixture',
    primaryOwnerId: owner,
  });
  await db.insert(workspaceMembers).values([
    { userId: owner, workspaceId, role: 'owner' },
    { userId: member, workspaceId, role: 'member' },
  ]);
  await db.insert(devices).values({
    userId: owner,
    workspaceId,
    deviceId: 'saved-shared-host',
    visibility: 'public',
    identitySource: 'fixture',
  });
});
afterEach(async () => {
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  await db.delete(users).where(eq(users.id, owner));
  await db.delete(users).where(eq(users.id, member));
});

const expectNoCreation = async () => {
  expect(await db.select().from(agents)).toEqual([]);
  expect(await db.select().from(resourcePermissions)).toEqual([]);
};

describe('normal Agent create RPC with genuinely unset target', () => {
  it.each([owner, member])(
    'persists a public unbound profile and removable explicit creator Use for %s',
    async (actor) => {
      const input = {
        visibility: 'public' as const,
        config: {
          title: 'Choose Device on first send',
          agencyConfig: { heterogeneousProvider: provider },
        },
      };
      const { agentId } = await caller(actor).createAgent(input);
      const [created] = await db.select().from(agents).where(eq(agents.id, agentId));
      expect(created.visibility).toBe('public');
      expect(created.userId).toBe(actor);
      expect(created.agencyConfig?.heterogeneousProvider).toEqual(provider);
      expect(created.agencyConfig).toHaveProperty('executionTargetSelectionPolicy', 'member');
      expect(created.agencyConfig).not.toHaveProperty('executionTarget');
      expect(created.agencyConfig).not.toHaveProperty('boundDeviceId');
      expect(created.agencyConfig).not.toHaveProperty('localSandbox');
      const predicate = and(
        eq(resourcePermissions.resourceId, agentId),
        eq(resourcePermissions.userId, actor),
      );
      expect(await db.select().from(resourcePermissions).where(predicate)).toEqual([
        expect.objectContaining({ accessLevel: 'use', createdBy: actor, workspaceId }),
      ]);
      await db.delete(resourcePermissions).where(predicate);
      await caller(actor).getAgentConfigById({ agentId });
      expect(await db.select().from(resourcePermissions).where(predicate)).toEqual([]);
      expect(
        (await db.select().from(agents).where(eq(agents.id, agentId)))[0].agencyConfig,
      ).toEqual(created.agencyConfig);
    },
  );

  it.each([
    { executionTarget: 'none' as const },
    { executionTarget: 'local' as const },
    { executionTarget: 'device' as const },
    { executionTarget: 'auto' as const },
    { executionTarget: 'sandbox' as const },
    { boundDeviceId: 'saved-shared-host' },
    { executionTargetSelectionPolicy: 'fixed' as const },
  ])('keeps incomplete or explicit target creation refused: %j', async (target) => {
    await expect(
      caller().createAgent({
        visibility: 'public',
        config: { agencyConfig: { heterogeneousProvider: provider, ...target } },
      }),
    ).rejects.toThrow('AGENT_HOST_REQUIRED');
    await expectNoCreation();
  });

  it('keeps an explicit unavailable binding refused', async () => {
    await expect(
      caller().createAgent({
        visibility: 'public',
        config: {
          agencyConfig: {
            heterogeneousProvider: provider,
            executionTarget: 'device',
            boundDeviceId: 'not-registered',
          },
        },
      }),
    ).rejects.toThrow('AGENT_HOST_UNAVAILABLE');
    await expectNoCreation();
  });

  it.each(['local', 'device'] as const)(
    'keeps a saved explicit %s binding',
    async (executionTarget) => {
      const { agentId } = await caller().createAgent({
        visibility: 'public',
        config: {
          agencyConfig: {
            heterogeneousProvider: provider,
            executionTarget,
            boundDeviceId: 'saved-shared-host',
          },
        },
      });
      expect(
        (await db.select().from(agents).where(eq(agents.id, agentId)))[0].agencyConfig,
      ).toMatchObject({ executionTarget, boundDeviceId: 'saved-shared-host' });
    },
  );

  it('keeps private and Viewer creation ceilings', async () => {
    await expect(
      caller().createAgent({
        visibility: 'private',
        config: { agencyConfig: { heterogeneousProvider: provider } },
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await db
      .update(workspaceMembers)
      .set({ role: 'viewer' })
      .where(eq(workspaceMembers.userId, member));
    await expect(
      caller(member).createAgent({
        visibility: 'public',
        config: { agencyConfig: { heterogeneousProvider: provider } },
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expectNoCreation();
  });

  it('keeps Orchestrator snapshots host-required', async () => {
    await expect(
      assertAgentRuntimeCreation(
        db,
        { userId: owner, workspaceId },
        { visibility: 'public', agencyConfig: { heterogeneousProvider: provider } },
        { purpose: 'orchestrator' },
      ),
    ).rejects.toThrow('AGENT_HOST_REQUIRED');
    await expectNoCreation();
  });

  it('keeps Prime credential admission after allowing an unset public target', async () => {
    await expect(
      caller().createAgent({
        visibility: 'public',
        config: {
          model: 'unbound-prime-model',
          provider: 'openai',
          agencyConfig: { heterogeneousProvider: { type: 'orvilo', model: 'unbound-prime-model' } },
        },
      }),
    ).rejects.toThrow('AGENT_PROVIDER_REQUIRED');
    await expectNoCreation();
  });

  it('keeps personal creation host-required', async () => {
    const personal = agentRouter.createCaller({ serverDB: db, userId: owner } as never);
    await expect(
      personal.createAgent({ config: { agencyConfig: { heterogeneousProvider: provider } } }),
    ).rejects.toThrow('AGENT_HOST_REQUIRED');
    await expectNoCreation();
  });
});

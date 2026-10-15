// @vitest-environment node
import type { OrviloDatabase } from '@orvilo/database';
import { getTestDB } from '@orvilo/database/test-utils';
import { eq, inArray } from 'drizzle-orm';
import type pg from 'pg';
import { afterEach, expect, it, vi } from 'vitest';

import { WorkspaceUserSettingsModel } from '@/database/models/workspaceUserSettings';
import { agents, devices, users, workspaceMembers, workspaces } from '@/database/schemas';

import { agentRouter } from '../../agent';
import { workspaceUserSettingsRouter } from '../../workspaceUserSettings';
import { createTestContext } from './setup';

const queries = vi.hoisted(() => vi.fn());
vi.mock('@/database/core/db-adaptor', () => ({ getServerDB: () => db }));
vi.mock('pg', async (importOriginal) => {
  const original = await importOriginal<typeof pg & { default: typeof pg }>();
  class Client {
    connect = async () => {};
    end = async () => {};
    query = queries;
  }
  return { ...original, Client, default: { ...original.default, Client } };
});
const db: OrviloDatabase = await getTestDB();
const seededUsers: string[] = [];
afterEach(async () => {
  if (db && seededUsers.length) await db.delete(users).where(inArray(users.id, seededUsers));
  seededUsers.length = 0;
  vi.unstubAllEnvs();
});

it('seeds separate personal devices across workers and a selectable shared Prime Orchestrator', async () => {
  // Execute the fixture's parameterized pg queries against the real migrated test schema.
  const client = (
    db as unknown as { $client: { query: (text: string, params: unknown[]) => Promise<unknown> } }
  ).$client;
  queries.mockImplementation((text: string, params: unknown[] = []) => client.query(text, params));
  vi.stubEnv('DATABASE_URL', 'postgres://fixture.invalid/test-only');
  vi.stubEnv('KEY_VAULTS_SECRET', Buffer.alloc(32, 1).toString('base64'));
  vi.stubEnv('E2E_RUN_ID', 'device-seed-regression');
  const deviceIds: string[] = [];
  for (const worker of ['retained-worker', 'new-worker']) {
    vi.stubEnv('CUCUMBER_WORKER_ID', worker);
    vi.resetModules();
    const { TEST_USER } = await import('../../../../../../../e2e/src/support/seedTestUser');
    const { bindTestUserExecutionDevice, ensureTestUserPrimeAgent, E2E_DEVICE_ID } =
      await import('../../../../../../../e2e/src/support/bindExecutionDevice');
    const { seedOrviloProviderBinding } =
      await import('../../../../../../../e2e/src/support/seedOrviloProviderBinding');
    seededUsers.push(TEST_USER.id);
    const workspaceId = `ws-${worker}`;
    const inboxId = `inbox-${worker}`;
    await db.insert(users).values({ id: TEST_USER.id });
    await db
      .insert(workspaces)
      .values({ id: workspaceId, name: worker, slug: worker, primaryOwnerId: TEST_USER.id });
    await db.insert(workspaceMembers).values({ userId: TEST_USER.id, workspaceId, role: 'owner' });
    await db
      .insert(agents)
      .values({ id: inboxId, userId: TEST_USER.id, workspaceId, virtual: true });
    const ctx = { ...createTestContext(TEST_USER.id), workspaceId };
    const agentCaller = agentRouter.createCaller(ctx);
    const settingsCaller = workspaceUserSettingsRouter.createCaller(ctx);
    const request = {
      async post(path: string, options: { data: { json: Record<string, unknown> } }) {
        let result: unknown;
        switch (path.split('/').at(-1)) {
          case 'workspace.ensureDefault': {
            result = { id: workspaceId };
            break;
          }
          case 'agent.getBuiltinAgent': {
            result = { id: inboxId };
            break;
          }
          case 'agent.createAgent': {
            result = await agentCaller.createAgent(
              options.data.json as Parameters<typeof agentCaller.createAgent>[0],
            );
            break;
          }
          case 'workspaceUserSettings.updatePreference': {
            result = await settingsCaller.updatePreference(options.data.json);
            break;
          }
          default: {
            throw new Error(`Unexpected fixture request: ${path}`);
          }
        }
        return { ok: () => true, json: async () => ({ result: { data: { json: result } } }) };
      },
    } as unknown as Parameters<typeof bindTestUserExecutionDevice>[0];
    await bindTestUserExecutionDevice(request);
    await bindTestUserExecutionDevice(request);
    await seedOrviloProviderBinding();
    const primeId = await ensureTestUserPrimeAgent(request);
    const [device] = await db.select().from(devices).where(eq(devices.userId, TEST_USER.id));
    expect(device.deviceId).toBe(E2E_DEVICE_ID);
    expect(await db.select().from(devices).where(eq(devices.userId, TEST_USER.id))).toHaveLength(1);
    const [prime] = await db.select().from(agents).where(eq(agents.id, primeId));
    expect(prime).toMatchObject({
      userId: TEST_USER.id,
      workspaceId,
      visibility: 'public',
      virtual: false,
    });
    expect(prime.agencyConfig?.boundDeviceId).toBe(device.deviceId);
    expect(
      await new WorkspaceUserSettingsModel(db, TEST_USER.id, workspaceId).getPreference(),
    ).toMatchObject({ orchestratorAgentId: primeId });
    expect(E2E_DEVICE_ID.length).toBeLessThanOrEqual(64);
    deviceIds.push(E2E_DEVICE_ID);
  }
  expect(new Set(deviceIds).size).toBe(2);
  expect(await db.select().from(devices).where(inArray(devices.userId, seededUsers))).toHaveLength(
    2,
  );
});

// @vitest-environment node
import { randomBytes } from 'node:crypto';

import { PROVIDER_CONFIG_ANCHOR_MODEL } from '@orvilo/types';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { KeyVaultsGateKeeper } from '@/server/modules/KeyVaultsEncrypt';

import { getTestDB } from '../../../core/getTestDB';
import { CredentialModel } from '../../../models/credential';
import { ProviderBindingModel } from '../../../models/providerBinding';
import { aiModels, aiProviders, users, workspaces } from '../../../schemas';
import type { OrviloDatabase } from '../../../type';
import { AiInfraRepos } from '../index';
import { ProviderBindingConflictError, ProviderBindingPlane } from '../providerBindings';

// vitest.config.server.mts runs with isolate:false, so one file's module mock
// serves every file; delegate through a per-test-installed global instead.
type GlobalWithMock = typeof globalThis & {
  __orviloTestLoadModels?: () => Promise<unknown[]>;
};

vi.mock('@orvilo/business-model-bank/model-config', () => ({
  loadModels: () =>
    (globalThis as GlobalWithMock).__orviloTestLoadModels?.() ?? Promise.resolve([]),
}));

const owner = 'binding-plane-owner';
const foreign = 'binding-plane-foreign';
const providerId = 'fixture-provider';

let db: OrviloDatabase;
let originalSecret: string | undefined;

const plane = () => new ProviderBindingPlane(db, owner);
const bindings = () => new ProviderBindingModel(db, owner);

const anchorOf = async (id = providerId) => {
  const rows = await bindings().list();
  return rows.find(
    (row) => row.config?.model === PROVIDER_CONFIG_ANCHOR_MODEL && row.config.provider === id,
  );
};

const modelRowsOf = async (id = providerId) => {
  const rows = await bindings().list();
  return rows.filter(
    (row) => row.config?.provider === id && row.config.model !== PROVIDER_CONFIG_ANCHOR_MODEL,
  );
};

const legacyProviderWhere = (id: string) =>
  and(eq(aiProviders.id, id), eq(aiProviders.userId, owner), isNull(aiProviders.workspaceId));

beforeAll(async () => {
  db = await getTestDB();
}, 30_000);

beforeEach(async () => {
  originalSecret = process.env.KEY_VAULTS_SECRET;
  process.env.KEY_VAULTS_SECRET = randomBytes(32).toString('base64');
  await db.insert(users).values([{ id: owner }, { id: foreign }]);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await db.delete(users).where(inArray(users.id, [owner, foreign]));
  if (originalSecret === undefined) delete process.env.KEY_VAULTS_SECRET;
  else process.env.KEY_VAULTS_SECRET = originalSecret;
});

describe('ProviderBindingPlane write→read roundtrip', () => {
  it('resolves a key-only OpenAI provider and keeps its model disarmed until verified', async () => {
    await plane().updateProviderConfig('openai', { keyVaults: { apiKey: 'sk-invalid-fixture' } });
    await plane().setProviderEnabled('openai', true);
    await plane().setModelEnabled('openai', 'gpt-4o-mini', true);
    const [row] = await modelRowsOf('openai');
    expect(row.config.endpoint).toBe('https://api.openai.com/v1');
    expect(row.config.enabled).toBe(false);
  });

  it('persists provider writes into bindings + credential and reads them back', async () => {
    await plane().createProvider({
      id: providerId,
      keyVaults: { apiKey: 'sk-test', baseURL: 'https://api.fixture/v1' },
      name: 'Fixture Provider',
      sdkType: 'openai',
      source: 'custom',
    });

    const anchor = await anchorOf();
    expect(anchor?.config).toMatchObject({
      enabled: false,
      endpoint: 'https://api.fixture/v1',
      model: PROVIDER_CONFIG_ANCHOR_MODEL,
      provider: providerId,
      providerSettings: { enabled: true, name: 'Fixture Provider', source: 'custom' },
      selection: { runtime: 'orvilo', target: 'sandbox' },
    });
    expect(anchor?.config.secretReference).toMatch(/^credential:/);

    // The apiKey is in the credential row, not in binding config.
    const detail = await plane().materializeDetail(providerId, anchor!);
    expect(detail.keyVaults).toMatchObject({
      apiKey: 'sk-test',
      baseURL: 'https://api.fixture/v1',
    });
    expect(detail.name).toBe('Fixture Provider');
    expect(detail.enabled).toBe(true);

    // listManagedProviders groups the anchor under its provider.
    const managed = await plane().getManaged(providerId);
    expect(managed?.anchor?.id).toBe(anchor?.id);
    expect(managed?.models).toEqual([]);
  });

  it('rejects creating an existing provider and surviving rows', async () => {
    await plane().createProvider({
      id: providerId,
      name: 'Dup',
      source: 'custom',
    });
    await expect(
      plane().createProvider({ id: providerId, name: 'Dup', source: 'custom' }),
    ).rejects.toThrow();
  });

  it('migrate-on-write adopts a legacy ai_providers row and deletes it', async () => {
    // Legacy row with gatekeeper-encrypted keyVaults — the same cipher the
    // router injects as `decryptLegacyKeyVaults`.
    const gateKeeper = await KeyVaultsGateKeeper.initWithEnvKey();
    await db.insert(aiProviders).values({
      checkModel: 'check-model',
      description: 'legacy desc',
      enabled: true,
      fetchOnClient: true,
      id: providerId,
      keyVaults: await gateKeeper.encrypt(
        JSON.stringify({ apiKey: 'sk-legacy', baseURL: 'https://legacy.example/v1' }),
      ),
      name: 'Legacy Fixture',
      settings: { sdkType: 'openai' },
      sort: 4,
      source: 'custom',
      userId: owner,
    });
    await db.insert(aiModels).values([
      { enabled: true, id: 'm-a', providerId, source: 'builtin', type: 'chat', userId: owner },
      { enabled: false, id: 'm-b', providerId, source: 'builtin', type: 'chat', userId: owner },
    ]);

    const planeWithResolver = new ProviderBindingPlane(db, owner, {
      decryptLegacyKeyVaults: KeyVaultsGateKeeper.getUserKeyVaults,
      resolveEnabledModelIds: async (id) =>
        (
          await db.query.aiModels.findMany({
            where: and(
              eq(aiModels.providerId, id),
              eq(aiModels.userId, owner),
              isNull(aiModels.workspaceId),
            ),
          })
        )
          .filter((row) => row.enabled === true)
          .map((row) => row.id),
    });

    // First write onto a legacy provider migrates it.
    await planeWithResolver.updateProviderConfig(providerId, { checkModel: 'new-check' });

    const anchor = await anchorOf();
    expect(anchor).toBeDefined();
    expect(anchor?.config.providerSettings).toMatchObject({
      checkModel: 'new-check',
      description: 'legacy desc',
      enabled: true,
      fetchOnClient: true,
      name: 'Legacy Fixture',
      settings: { sdkType: 'openai' },
      sort: 4,
      source: 'custom',
    });
    expect(anchor?.config.endpoint).toBe('https://legacy.example/v1');
    // fetchOnClient → local target
    expect(anchor?.config.selection.target).toBe('local');

    // Legacy provider row is gone; ai_models registry rows stay.
    expect(
      await db.query.aiProviders.findFirst({ where: legacyProviderWhere(providerId) }),
    ).toBeUndefined();
    expect(await db.query.aiModels.findMany()).toHaveLength(2);

    // Enabled model materialized, disabled one did not.
    const rows = await modelRowsOf();
    expect(rows.map((row) => row.config.model)).toEqual(['m-a']);
    expect(rows[0].config.enabled).toBe(false);
    expect(rows[0].config.endpoint).toBe('https://legacy.example/v1');

    // keyVaults hydrated from the credential.
    const detail = await planeWithResolver.materializeDetail(providerId, anchor!);
    expect(detail.keyVaults).toMatchObject({ apiKey: 'sk-legacy' });
  });

  it('mirrors provider enable onto model rows and prunes disabled models', async () => {
    await plane().createProvider({
      id: providerId,
      keyVaults: { apiKey: 'sk' },
      name: 'Fixture',
      source: 'custom',
    });
    await plane().setModelEnabled(providerId, 'm-a', true);
    await plane().setModelEnabled(providerId, 'm-b', true);

    let rows = await modelRowsOf();
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => !row.config.enabled)).toBe(true); // provider enabled is not verification

    await plane().setProviderEnabled(providerId, false);
    rows = await modelRowsOf();
    expect(rows.map((row) => row.config.enabled)).toEqual([false, false]);
    expect((await anchorOf())?.config.providerSettings?.enabled).toBe(false);

    await plane().setModelEnabled(providerId, 'm-b', false);
    expect((await modelRowsOf()).map((row) => row.config.model)).toEqual(['m-a']);

    await plane().setProviderEnabled(providerId, true);
    rows = await modelRowsOf();
    expect(rows).toHaveLength(1);
    expect(rows[0].config.enabled).toBe(false);
  });

  it('rechecks after a key change and never arms a rejected connection', async () => {
    let accepted = true;
    const verifyBinding = vi.fn(async (row) => {
      if (accepted) await bindings().setEnabled(row.id, true);
    });
    const verifiedPlane = new ProviderBindingPlane(db, owner, { verifyBinding });
    await verifiedPlane.updateProviderConfig('openai', { keyVaults: { apiKey: 'fixture' } });
    await verifiedPlane.setProviderEnabled('openai', true);
    await verifiedPlane.setModelEnabled('openai', 'gpt-4o-mini', true);
    expect((await modelRowsOf('openai'))[0].config.enabled).toBe(true);
    accepted = false;
    await verifiedPlane.updateProviderConfig('openai', { keyVaults: { apiKey: 'wrong' } });
    expect((await modelRowsOf('openai'))[0].config.enabled).toBe(false);
    expect(verifyBinding).toHaveBeenCalledTimes(2);
  });

  it('verifies each enabled model once in a batch', async () => {
    const verifyBinding = vi.fn(async (_row: { config: { model: string } }) => undefined);
    const verifiedPlane = new ProviderBindingPlane(db, owner, { verifyBinding });
    await verifiedPlane.updateProviderConfig('openai', { keyVaults: { apiKey: 'fixture' } });
    await verifiedPlane.setProviderEnabled('openai', true);
    await verifiedPlane.setModelsEnabled('openai', ['model-a', 'model-b', 'model-c'], true);
    expect(verifyBinding).toHaveBeenCalledTimes(3);
    expect(verifyBinding.mock.calls.map(([row]) => row.config.model).sort()).toEqual([
      'model-a',
      'model-b',
      'model-c',
    ]);
  });

  it('unmanaged providers are unaffected by model mirrors', async () => {
    await plane().setModelEnabled(providerId, 'm-a', true);
    expect(await bindings().list()).toEqual([]);
  });

  it('merges keyVaults on config write and drops keys set to undefined', async () => {
    await plane().createProvider({
      id: providerId,
      keyVaults: { apiKey: 'one', oauthAccessToken: 'tok' },
      name: 'Fixture',
      source: 'custom',
    });

    await plane().updateProviderKeyVaults(providerId, {
      oauthAccessToken: 'tok-2',
      oauthRefreshToken: 'ref',
    });
    let detail = await plane().materializeDetail(providerId, (await anchorOf())!);
    expect(detail.keyVaults).toMatchObject({
      apiKey: 'one',
      oauthAccessToken: 'tok-2',
      oauthRefreshToken: 'ref',
    });

    // undefined deletes the key (legacy updateConfig semantics).
    await plane().updateProviderKeyVaults(providerId, { oauthAccessToken: undefined });
    detail = await plane().materializeDetail(providerId, (await anchorOf())!);
    expect(detail.keyVaults?.oauthAccessToken).toBeUndefined();
    expect(detail.keyVaults?.oauthRefreshToken).toBe('ref');
  });

  it('erases bindings, credential and legacy rows on deleteProvider', async () => {
    await plane().createProvider({
      id: providerId,
      keyVaults: { apiKey: 'sk' },
      name: 'Fixture',
      source: 'custom',
    });
    await plane().setModelEnabled(providerId, 'm-a', true);
    await db.insert(aiModels).values({
      enabled: true,
      id: 'm-x',
      providerId,
      source: 'custom',
      type: 'chat',
      userId: owner,
    });

    await plane().deleteProvider(providerId);

    expect(await bindings().list()).toEqual([]);
    expect(await new CredentialModel(db, owner).listPersonal()).toEqual([]);
    expect(await db.query.aiProviders.findMany()).toEqual([]);
    expect(await db.query.aiModels.findMany()).toEqual([]);
  });

  it("leaves foreign users blind to the owner's bindings", async () => {
    await plane().createProvider({ id: providerId, name: 'Mine', source: 'custom' });

    const otherPlane = new ProviderBindingPlane(db, foreign);
    expect(await otherPlane.getManaged(providerId)).toBeUndefined();
    expect(await otherPlane.listManagedProviders()).toEqual(new Map());
    expect(await new ProviderBindingModel(db, foreign).list()).toEqual([]);
  });
});

/**
 * Replicates the canonical `resolveOrviloProviderBinding` predicate from
 * `apps/server/src/services/providerBinding/execution.ts`: `enabled`,
 * `selection.runtime === 'orvilo'`, target equality, and optional
 * provider/model narrowing. A stale `selection.engine` on the row is dead
 * data — never consulted.
 */
const resolveLike = async (
  target: 'local' | 'device' | 'sandbox',
  match?: { model?: string; provider?: string },
) => {
  const rows = await new ProviderBindingModel(db, owner).list();
  return rows.find((row) => {
    if (row.config?.enabled !== true) return false;
    const selection = row.config?.selection;
    if (!selection || selection.runtime !== 'orvilo' || selection.target !== target) return false;
    if (match?.provider && row.config?.provider !== match.provider) return false;
    if (match?.model && row.config?.model !== match.model) return false;
    return true;
  });
};

describe('ProviderBindingPlane workspace scope', () => {
  const workspaceId = 'ws-1';

  beforeEach(async () => {
    await db
      .insert(workspaces)
      .values({ id: workspaceId, name: 'WS 1', primaryOwnerId: owner, slug: workspaceId });
  });

  it('lands a workspace-context write on the binding plane and resolves via resolver semantics', async () => {
    const gateKeeper = await KeyVaultsGateKeeper.initWithEnvKey();
    // A shared workspace row written by another member — visible in the
    // caller's scope like `buildWorkspaceWhere` renders it.
    await db.insert(aiProviders).values({
      checkModel: 'ws-check',
      enabled: false,
      id: providerId,
      keyVaults: await gateKeeper.encrypt(
        JSON.stringify({ apiKey: 'sk-shared', baseURL: 'https://shared.example/v1' }),
      ),
      name: 'Shared Fixture',
      source: 'custom',
      userId: foreign,
      workspaceId,
    });
    await db.insert(aiModels).values({
      enabled: true,
      id: 'm-ws',
      providerId,
      source: 'builtin',
      type: 'chat',
      userId: owner,
      workspaceId,
    });

    const wsPlane = new ProviderBindingPlane(db, owner, {
      decryptLegacyKeyVaults: KeyVaultsGateKeeper.getUserKeyVaults,
      resolveEnabledModelIds: async (id) =>
        (
          await db.query.aiModels.findMany({
            where: and(eq(aiModels.providerId, id), eq(aiModels.workspaceId, workspaceId)),
          })
        )
          .filter((row) => row.enabled === true)
          .map((row) => row.id),
      workspaceId,
    });

    await wsPlane.setProviderEnabled(providerId, true);

    // The write landed as personal bindings seeded from the shared row.
    const anchor = await anchorOf();
    expect(anchor).toBeDefined();
    expect(anchor?.config.providerSettings).toMatchObject({
      checkModel: 'ws-check',
      enabled: true,
      name: 'Shared Fixture',
      source: 'custom',
    });
    expect(anchor?.config.endpoint).toBe('https://shared.example/v1');

    // The shared workspace row survives for other members — only the
    // caller's own unfiled row is ever deleted by migrate-on-write.
    expect(
      await db.query.aiProviders.findFirst({
        where: and(eq(aiProviders.id, providerId), eq(aiProviders.workspaceId, workspaceId)),
      }),
    ).toBeDefined();
    expect(
      await db.query.aiProviders.findFirst({ where: legacyProviderWhere(providerId) }),
    ).toBeUndefined();

    // A server verification is required before the migrated route can resolve.
    expect(await resolveLike('sandbox')).toBeUndefined();
    const [unverified] = await modelRowsOf();
    await bindings().setEnabled(unverified.id, true);

    // The enabled model materialized a route row the canonical resolver
    // predicate matches: runtime 'orvilo' + https → 'sandbox' target.
    const resolved = await resolveLike('sandbox', { model: 'm-ws', provider: providerId });
    expect(resolved).toBeDefined();
    expect(resolved?.config).toMatchObject({
      enabled: true,
      endpoint: 'https://shared.example/v1',
      model: 'm-ws',
      provider: providerId,
    });
    expect(resolved?.config.secretReference).toMatch(/^credential:/);
    // Unconstrained resolution also lands on this provider's rows.
    expect(await resolveLike('sandbox')).toBeDefined();

    // keyVaults hydrated from the personal credential copy.
    const detail = await wsPlane.materializeDetail(providerId, anchor!);
    expect(detail.keyVaults).toMatchObject({ apiKey: 'sk-shared' });
  });

  it('adopts and deletes only the caller-owned unfiled row under workspace scope', async () => {
    const gateKeeper = await KeyVaultsGateKeeper.initWithEnvKey();
    await db.insert(aiProviders).values([
      {
        enabled: true,
        id: providerId,
        keyVaults: await gateKeeper.encrypt(JSON.stringify({ apiKey: 'sk-own' })),
        name: 'Own Fixture',
        source: 'custom',
        userId: owner,
      },
      {
        enabled: false,
        id: providerId,
        name: 'Shared Fixture',
        source: 'custom',
        userId: foreign,
        workspaceId,
      },
    ]);

    const wsPlane = new ProviderBindingPlane(db, owner, {
      decryptLegacyKeyVaults: KeyVaultsGateKeeper.getUserKeyVaults,
      workspaceId,
    });
    await wsPlane.setProviderEnabled(providerId, true);

    const anchor = await anchorOf();
    expect(anchor?.config.providerSettings).toMatchObject({
      enabled: true,
      name: 'Own Fixture',
    });

    // Own unfiled row deleted; shared workspace row preserved.
    expect(
      await db.query.aiProviders.findFirst({ where: legacyProviderWhere(providerId) }),
    ).toBeUndefined();
    expect(
      await db.query.aiProviders.findFirst({
        where: and(eq(aiProviders.id, providerId), eq(aiProviders.workspaceId, workspaceId)),
      }),
    ).toBeDefined();
  });

  it('conflicts on a shared workspace row only within workspace scope', async () => {
    await db.insert(aiProviders).values({
      enabled: true,
      id: providerId,
      name: 'Shared Fixture',
      source: 'custom',
      userId: foreign,
      workspaceId,
    });

    const wsPlane = new ProviderBindingPlane(db, owner, { workspaceId });
    await expect(
      wsPlane.createProvider({ id: providerId, name: 'Dup', source: 'custom' }),
    ).rejects.toThrow(ProviderBindingConflictError);

    // Personal scope does not see the workspace row — no conflict.
    await expect(
      plane().createProvider({ id: providerId, name: 'Personal', source: 'custom' }),
    ).resolves.toBe(providerId);
  });

  it('erases shared + own legacy rows and bindings under workspace scope', async () => {
    const wsPlane = new ProviderBindingPlane(db, owner, { workspaceId });
    await wsPlane.createProvider({ id: providerId, name: 'Fixture', source: 'custom' });
    await db.insert(aiProviders).values([
      {
        enabled: true,
        id: providerId,
        name: 'Shared',
        source: 'custom',
        userId: foreign,
        workspaceId,
      },
      { enabled: true, id: providerId, name: 'Own', source: 'custom', userId: owner },
      { enabled: true, id: providerId, name: 'Foreign', source: 'custom', userId: foreign },
    ]);
    await db.insert(aiModels).values([
      {
        enabled: true,
        id: 'm-ws',
        providerId,
        source: 'custom',
        type: 'chat',
        userId: foreign,
        workspaceId,
      },
      { enabled: true, id: 'm-own', providerId, source: 'custom', type: 'chat', userId: owner },
      {
        enabled: true,
        id: 'm-foreign',
        providerId,
        source: 'custom',
        type: 'chat',
        userId: foreign,
      },
    ]);

    await wsPlane.deleteProvider(providerId);

    expect(await bindings().list()).toEqual([]);
    expect(await db.query.aiProviders.findMany()).toEqual([
      expect.objectContaining({ name: 'Foreign', userId: foreign }),
    ]);
    expect(await db.query.aiModels.findMany()).toEqual([
      expect.objectContaining({ id: 'm-foreign', userId: foreign }),
    ]);
  });
});

describe('AiInfraRepos dual-read overlay', () => {
  it('prefers binding anchors in list and detail over a deleted legacy row', async () => {
    const gateKeeper = await KeyVaultsGateKeeper.initWithEnvKey();
    await db.insert(aiProviders).values({
      enabled: false,
      id: providerId,
      keyVaults: await gateKeeper.encrypt(JSON.stringify({ apiKey: 'sk-old' })),
      name: 'Old Name',
      source: 'custom',
      userId: owner,
    });
    const repos = new AiInfraRepos(db, owner, {});

    // Legacy row still renders before migration (dual-read).
    const before = await repos.getAiProviderList();
    expect(before.find((item) => item.id === providerId)?.name).toBe('Old Name');

    await new ProviderBindingPlane(db, owner, {
      decryptLegacyKeyVaults: KeyVaultsGateKeeper.getUserKeyVaults,
    }).setProviderEnabled(providerId, true); // migrate-on-write

    const after = await repos.getAiProviderList();
    const item = after.find((entry) => entry.id === providerId);
    expect(item).toMatchObject({ enabled: true, name: 'Old Name' });

    const detail = await repos.getAiProviderDetail(providerId);
    expect(detail).toMatchObject({
      enabled: true,
      id: providerId,
      keyVaults: { apiKey: 'sk-old' },
      name: 'Old Name',
    });
  });
});

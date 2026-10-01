// @vitest-environment node
import { randomBytes } from 'node:crypto';

import { PROVIDER_CONFIG_ANCHOR_MODEL } from '@orvilo/types';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { KeyVaultsGateKeeper } from '@/server/modules/KeyVaultsEncrypt';

import { getTestDB } from '../../../core/getTestDB';
import { CredentialModel } from '../../../models/credential';
import { ProviderBindingModel } from '../../../models/providerBinding';
import { aiModels, aiProviders, users } from '../../../schemas';
import type { OrviloDatabase } from '../../../type';
import { AiInfraRepos } from '../index';
import { ProviderBindingPlane } from '../providerBindings';

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
    expect(rows[0].config.enabled).toBe(true);
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
    expect(rows.every((row) => row.config.enabled)).toBe(true); // provider created enabled:true

    await plane().setProviderEnabled(providerId, false);
    rows = await modelRowsOf();
    expect(rows.map((row) => row.config.enabled)).toEqual([false, false]);
    expect((await anchorOf())?.config.providerSettings?.enabled).toBe(false);

    await plane().setModelEnabled(providerId, 'm-b', false);
    expect((await modelRowsOf()).map((row) => row.config.model)).toEqual(['m-a']);

    await plane().setProviderEnabled(providerId, true);
    rows = await modelRowsOf();
    expect(rows).toHaveLength(1);
    expect(rows[0].config.enabled).toBe(true);
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

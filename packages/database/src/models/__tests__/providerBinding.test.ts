// @vitest-environment node
import { randomBytes } from 'node:crypto';

import { providerBindingConfigSchema } from '@orvilo/types';
import { inArray } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import { credentials, users, workspaces } from '../../schemas';
import { CredentialModel } from '../credential';
import { ProviderBindingModel } from '../providerBinding';

const db = await getTestDB();
const owner = 'provider-test-owner';
const foreign = 'provider-test-foreign';
const workspace = 'provider-test-workspace';
const model = new ProviderBindingModel(db, owner);
const other = new ProviderBindingModel(db, foreign);
let reference: string;
let foreignReference: string;
let orgReference: string;
let originalSecret: string | undefined;

const config = () =>
  providerBindingConfigSchema.parse({
    name: 'Fixture',
    provider: 'openai',
    model: 'fixture-model',
    endpoint: 'https://provider.example/v1',
    secretReference: reference,
    enabled: false,
    selection: {
      runtime: 'orvilo',
      engine: 'claude-sdk',
      effort: 'default',
      mode: 'default',
      speed: 'default',
      target: 'sandbox',
    },
  });

beforeEach(async () => {
  originalSecret = process.env.KEY_VAULTS_SECRET;
  process.env.KEY_VAULTS_SECRET = randomBytes(32).toString('base64');
  await db.insert(users).values([{ id: owner }, { id: foreign }]);
  await db
    .insert(workspaces)
    .values({ id: workspace, name: 'Fixture', slug: workspace, primaryOwnerId: owner });
  const make = (userId: string, key: string, workspaceId?: string) =>
    new CredentialModel(db, userId).create({
      key,
      name: key,
      type: 'kv-env',
      payload: { values: { token: 'fixture-only' } },
      workspaceId,
    });
  reference = `credential:${(await make(owner, 'own')).id}`;
  foreignReference = `credential:${(await make(foreign, 'foreign')).id}`;
  orgReference = `credential:${(await make(owner, 'org', workspace)).id}`;
});

afterEach(async () => {
  vi.restoreAllMocks();
  await db.delete(workspaces).where(inArray(workspaces.id, [workspace]));
  await db.delete(users).where(inArray(users.id, [owner, foreign]));
  if (originalSecret === undefined) delete process.env.KEY_VAULTS_SECRET;
  else process.env.KEY_VAULTS_SECRET = originalSecret;
});

describe('Provider binding persistence', () => {
  it('validates direct model writes before persistence', async () => {
    const invalid = { ...config(), enabled: true } as unknown as ReturnType<typeof config>;
    await expect(model.create(invalid)).rejects.toThrow();
    expect(await model.list()).toEqual([]);
    const row = await model.create(config());
    await expect(model.update(row.id, 1, invalid)).rejects.toThrow();
    expect(await model.find(row.id)).toMatchObject({ revision: 1, config: { enabled: false } });
  });

  it('retains defaults for omitted effort, mode and speed', async () => {
    const input = { ...config(), selection: { runtime: 'orvilo', target: 'sandbox' } };
    const normalized = providerBindingConfigSchema.parse(input);
    expect(normalized.selection).toMatchObject({
      effort: 'default',
      mode: 'default',
      speed: 'default',
    });
    const row = await model.create(input as ReturnType<typeof config>);
    expect(row.config.selection).toEqual(normalized.selection);
  });

  it('persists configurations across model instances and isolates ownership', async () => {
    const row = await model.create(config());
    expect((await new ProviderBindingModel(db, owner).find(row.id))?.config).toEqual(config());
    expect(await other.list()).toEqual([]);
    expect(await other.find(row.id)).toBeUndefined();
    expect(await other.update(row.id, 1, config())).toBeUndefined();
    expect(await other.delete(row.id, 1)).toBeUndefined();
    expect(await model.find(row.id)).toBeDefined();
  });

  it('allows one concurrent revision update and rejects stale deletion', async () => {
    const row = await model.create(config());
    const results = await Promise.all([
      model.update(row.id, 1, config()),
      model.update(row.id, 1, config()),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await model.delete(row.id, 1)).toBeUndefined();
    expect(await model.delete(row.id, 2)).toEqual({ id: row.id });
    expect(await model.find(row.id)).toBeUndefined();
  });

  it('admits only personal owner credentials and notices deletion', async () => {
    expect(await model.ownsCredentialReference(reference)).toBe(true);
    expect(await model.ownsCredentialReference(foreignReference)).toBe(false);
    expect(await model.ownsCredentialReference(orgReference)).toBe(false);
    await db.delete(credentials).where(inArray(credentials.ownerUserId, [owner]));
    expect(await model.ownsCredentialReference(reference)).toBe(false);
  });
});

describe('Provider API against real persistence', () => {
  const caller = async (userId?: string, apiKeyScopes?: string[]) => {
    // Only the database connection boundary is replaced; real guards/router/model run.
    const adaptor = await import('../../core/db-adaptor');
    vi.spyOn(adaptor, 'getServerDB').mockResolvedValue(db);
    const { router } = await import('@/libs/trpc/lambda');
    const { providerBindingRouter } =
      await import('../../../../../apps/server/src/routers/lambda/providerBinding');
    return router({ providerBinding: providerBindingRouter }).createCaller({
      userId,
      apiKeyScopes,
    } as never).providerBinding;
  };

  it('rejects anonymous and restricted keys without writing', async () => {
    await expect((await caller()).create(config())).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect((await caller(owner, ['model:invoke'])).create(config())).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(await model.list()).toEqual([]);
  });

  it('rejects foreign and org credentials; full access keys do not bypass ownership', async () => {
    const api = await caller(owner);
    for (const secretReference of [foreignReference, orgReference]) {
      await expect(api.create({ ...config(), secretReference })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    }
    const { data } = await api.create(config());
    const outsider = await caller(foreign, ['*']);
    await expect(outsider.delete({ id: data.id, revision: 1 })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    expect((await outsider.list()).data).toEqual([]);
    expect(await model.find(data.id)).toBeDefined();
  });

  it('fails closed on connection checking and rejects stale revisions', async () => {
    const api = await caller(owner);
    const { data } = await api.create(config());
    // The real broker reports a failed provider probe as `unavailable`, not a
    // green check — the wired composition resolves rather than throwing.
    const check = await api.checkConnection({ id: data.id, revision: 1 });
    expect(check).toMatchObject({
      bindingId: data.id,
      bindingRevision: 1,
      status: 'unavailable',
    });
    await api.update({ id: data.id, revision: 1, config: { ...config(), name: 'Updated' } });
    await expect(api.checkConnection({ id: data.id, revision: 1 })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    await expect(api.delete({ id: data.id, revision: 1 })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    await db.delete(credentials).where(inArray(credentials.ownerUserId, [owner]));
    await expect(api.checkConnection({ id: data.id, revision: 2 })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});

describe('Canonical broker adapter boundary (controlled broker double, no provider readiness claim)', () => {
  const adapter = () =>
    import('../../../../../apps/server/src/services/providerBinding/configuration');
  const scope = {
    tenantId: 'fixture-tenant',
    ownerId: owner,
    principalId: owner,
    authorityRevision: 1,
  };

  it('preserves broker unavailable status without turning it into ready', async () => {
    const row = await model.create(config());
    const { checkProviderBinding } = await adapter();
    const result = await checkProviderBinding(
      model,
      owner,
      { id: row.id, revision: 1 },
      {
        authorizeScope: async () => scope,
        broker: {
          capabilities: async () => ({ ok: true, value: [] }),
          checkBinding: async () => ({
            ok: true,
            value: { bindingId: row.id, bindingRevision: 1, checkedAt: 1, status: 'unavailable' },
          }),
        },
      },
    );
    expect(result.status).toBe('unavailable');
  });

  it('rejects a binding changed while the broker request was in flight', async () => {
    const row = await model.create(config());
    const { checkProviderBinding } = await adapter();
    await expect(
      checkProviderBinding(
        model,
        owner,
        { id: row.id, revision: 1 },
        {
          authorizeScope: async () => scope,
          broker: {
            capabilities: async () => ({ ok: true, value: [] }),
            checkBinding: async () => {
              await model.update(row.id, 1, { ...config(), name: 'Changed concurrently' });
              return {
                ok: true,
                value: {
                  bindingId: row.id,
                  bindingRevision: 1,
                  checkedAt: 1,
                  status: 'unavailable',
                },
              };
            },
          },
        },
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('does not expose unexpected broker exception details', async () => {
    const row = await model.create(config());
    const { checkProviderBinding } = await adapter();
    await expect(
      checkProviderBinding(
        model,
        owner,
        { id: row.id, revision: 1 },
        {
          authorizeScope: async () => scope,
          broker: {
            capabilities: async () => ({ ok: true, value: [] }),
            checkBinding: async () => {
              throw new Error('fixture-private-provider-response');
            },
          },
        },
      ),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED', message: 'PROVIDER_CHECK_UNAVAILABLE' });
  });

  it('rejects credential deletion during the broker request', async () => {
    const row = await model.create(config());
    const { checkProviderBinding } = await adapter();
    await expect(
      checkProviderBinding(
        model,
        owner,
        { id: row.id, revision: 1 },
        {
          authorizeScope: async () => scope,
          broker: {
            capabilities: async () => ({ ok: true, value: [] }),
            checkBinding: async () => {
              await db.delete(credentials).where(inArray(credentials.ownerUserId, [owner]));
              return {
                ok: true,
                value: {
                  bindingId: row.id,
                  bindingRevision: 1,
                  checkedAt: 1,
                  status: 'unavailable',
                },
              };
            },
          },
        },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

// @vitest-environment node
import { randomBytes, randomUUID } from 'node:crypto';

import type { ProviderBindingConfig } from '@orvilo/types';
import { inArray } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '@/database/core/getTestDB';
import { CredentialModel } from '@/database/models/credential';
import { credentials, providerBindings, users } from '@/database/schemas';
import type { OrviloDatabase } from '@/database/type';

import { issueBindingExecution, resolveOrviloProviderBinding } from './execution';

const db: OrviloDatabase = await getTestDB();

const OWNER = 'pb-exec-owner';
const OUTSIDER = 'pb-exec-outsider';
const MODEL_ID = 'mock-model-1';

const config = (
  overrides?: Omit<Partial<ProviderBindingConfig>, 'selection'> & {
    engine?: ProviderBindingConfig['selection']['engine'];
    runtime?: ProviderBindingConfig['selection']['runtime'];
    target?: ProviderBindingConfig['selection']['target'];
  },
): ProviderBindingConfig => {
  const { engine, runtime, target, ...rest } = overrides ?? {};
  return {
    enabled: false,
    endpoint: 'https://provider.test/v1',
    model: MODEL_ID,
    name: 'Execution fixture',
    provider: 'mock',
    secretReference: 'credential:cred_missing',
    ...rest,
    selection: {
      effort: 'default',
      engine,
      mode: 'default',
      runtime: runtime ?? 'orvilo',
      speed: 'default',
      target: target ?? 'sandbox',
    },
  };
};

const insertBinding = (userId: string, cfg: ProviderBindingConfig) =>
  db.insert(providerBindings).values({ config: cfg, userId }).returning();

const createCredential = (userId: string, values: Record<string, string> = { K: 'v' }) =>
  new CredentialModel(db, userId).create({
    key: `key_${randomBytes(4).toString('hex')}`,
    name: 'Fixture credential',
    payload: { values },
    type: 'kv-env',
  });

beforeEach(async () => {
  await db.insert(users).values([{ id: OWNER }, { id: OUTSIDER }]);
});

afterEach(async () => {
  await db.delete(providerBindings).where(inArray(providerBindings.userId, [OWNER, OUTSIDER]));
  await db.delete(credentials).where(inArray(credentials.ownerUserId, [OWNER, OUTSIDER]));
  await db.delete(users).where(inArray(users.id, [OWNER, OUTSIDER]));
});

describe('resolveOrviloProviderBinding', () => {
  it('matches runtime=orvilo with normalized engine and requested target', async () => {
    const [row] = await insertBinding(OWNER, config({ engine: 'claude-sdk', target: 'sandbox' }));
    expect(await resolveOrviloProviderBinding(db, OWNER, 'claude-sdk', 'sandbox')).toMatchObject({
      id: row.id,
    });
    // engine=null on both sides normalizes to the claude-sdk default.
    expect(await resolveOrviloProviderBinding(db, OWNER, null, 'sandbox')).toMatchObject({
      id: row.id,
    });
  });

  it('rejects a different target, runtime or owner', async () => {
    await insertBinding(OWNER, config({ target: 'sandbox' }));
    expect(await resolveOrviloProviderBinding(db, OWNER, 'claude-sdk', 'device')).toBeUndefined();
    expect(await resolveOrviloProviderBinding(db, OWNER, 'claude-sdk', 'local')).toBeUndefined();
    expect(
      await resolveOrviloProviderBinding(db, OUTSIDER, 'claude-sdk', 'sandbox'),
    ).toBeUndefined();
    await insertBinding(OWNER, config({ runtime: 'claude-code', target: 'sandbox' }));
    const hits = await resolveOrviloProviderBinding(db, OWNER, 'claude-sdk', 'device');
    expect(hits).toBeUndefined();
  });

  it('matches the requested engine only', async () => {
    const [codex] = await insertBinding(
      OWNER,
      config({ engine: 'codex-app-server', target: 'sandbox' }),
    );
    const [claude] = await insertBinding(
      OWNER,
      config({ engine: 'claude-sdk', target: 'sandbox' }),
    );
    expect(
      await resolveOrviloProviderBinding(db, OWNER, 'codex-app-server', 'sandbox'),
    ).toMatchObject({ id: codex.id });
    expect(await resolveOrviloProviderBinding(db, OWNER, 'claude-sdk', 'sandbox')).toMatchObject({
      id: claude.id,
    });
  });
});

describe('issueBindingExecution', () => {
  it('issues a contract binding stamped with the run tenant and route', async () => {
    const cred = await createCredential(OWNER);
    const [row] = await insertBinding(OWNER, config({ secretReference: `credential:${cred.id}` }));
    const issued = await issueBindingExecution(db, {
      bindingId: row.id,
      bindingRevision: row.revision,
      ownerId: OWNER,
      tenantId: 'ws-run-tenant',
    });
    expect(issued?.binding).toEqual({
      bindingId: row.id,
      modelRoutes: [MODEL_ID],
      ownerId: OWNER,
      providerId: 'mock',
      revision: row.revision,
      schemaVersion: expect.any(Number),
      secretReference: `credential:${cred.id}`,
      tenantId: 'ws-run-tenant',
    });
  });

  it('refuses a stale revision — the row moved under the claim', async () => {
    const cred = await createCredential(OWNER);
    const [row] = await insertBinding(OWNER, config({ secretReference: `credential:${cred.id}` }));
    expect(
      await issueBindingExecution(db, {
        bindingId: row.id,
        bindingRevision: row.revision + 1,
        ownerId: OWNER,
        tenantId: 'ws',
      }),
    ).toBeUndefined();
  });

  it('refuses when the credential is not a personal credential of the claimant', async () => {
    const outsiderCred = await createCredential(OUTSIDER);
    const [row] = await insertBinding(
      OWNER,
      config({ secretReference: `credential:${outsiderCred.id}` }),
    );
    expect(
      await issueBindingExecution(db, {
        bindingId: row.id,
        bindingRevision: row.revision,
        ownerId: OWNER,
        tenantId: 'ws',
      }),
    ).toBeUndefined();
  });

  it('refuses a missing credential reference or missing row', async () => {
    const [row] = await insertBinding(OWNER, config());
    expect(
      await issueBindingExecution(db, {
        bindingId: row.id,
        bindingRevision: row.revision,
        ownerId: OWNER,
        tenantId: 'ws',
      }),
    ).toBeUndefined();
    expect(
      await issueBindingExecution(db, {
        bindingId: randomUUID(),
        bindingRevision: 1,
        ownerId: OWNER,
        tenantId: 'ws',
      }),
    ).toBeUndefined();
  });
});

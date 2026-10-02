// @vitest-environment node
import { randomBytes, randomUUID } from 'node:crypto';

import type { ProviderBindingConfig } from '@orvilo/types';
import { inArray } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '@/database/core/getTestDB';
import { CredentialModel } from '@/database/models/credential';
import { credentials, providerBindings, users } from '@/database/schemas';
import type { OrviloDatabase } from '@/database/type';

import { issueBindingExecution, resolveOrviloProviderBinding } from './execution';

const db: OrviloDatabase = await getTestDB();

let originalSecret: string | undefined;

const OWNER = 'pb-exec-owner';
const OUTSIDER = 'pb-exec-outsider';
const MODEL_ID = 'mock-model-1';

const config = (
  overrides?: Omit<Partial<ProviderBindingConfig>, 'selection'> & {
    selection?: Partial<ProviderBindingConfig['selection']>;
  },
): ProviderBindingConfig => ({
  enabled: true,
  endpoint: 'https://provider.test/v1',
  model: MODEL_ID,
  name: 'Execution fixture',
  provider: 'mock',
  secretReference: 'credential:cred_missing',
  ...overrides,
  selection: {
    effort: 'default',
    engine: overrides?.selection?.engine,
    mode: 'default',
    runtime: overrides?.selection?.runtime ?? 'orvilo',
    speed: 'default',
    target: overrides?.selection?.target ?? 'sandbox',
  },
});

const insertBinding = (userId: string, cfg: ProviderBindingConfig) =>
  db.insert(providerBindings).values({ config: cfg, userId }).returning();

const createCredential = (userId: string, values: Record<string, string> = { K: 'v' }) =>
  new CredentialModel(db, userId).create({
    key: `key_${randomBytes(4).toString('hex')}`,
    name: 'Fixture credential',
    payload: { values },
    type: 'kv-env',
  });

beforeAll(() => {
  originalSecret = process.env.KEY_VAULTS_SECRET;
  process.env.KEY_VAULTS_SECRET = randomBytes(32).toString('base64');
});

beforeEach(async () => {
  await db.insert(users).values([{ id: OWNER }, { id: OUTSIDER }]);
});

afterAll(() => {
  if (originalSecret === undefined) delete process.env.KEY_VAULTS_SECRET;
  else process.env.KEY_VAULTS_SECRET = originalSecret;
});

afterEach(async () => {
  await db.delete(providerBindings).where(inArray(providerBindings.userId, [OWNER, OUTSIDER]));
  await db.delete(credentials).where(inArray(credentials.ownerUserId, [OWNER, OUTSIDER]));
  await db.delete(users).where(inArray(users.id, [OWNER, OUTSIDER]));
});

describe('resolveOrviloProviderBinding', () => {
  it('matches an enabled runtime=orvilo row on the requested target', async () => {
    const [row] = await insertBinding(OWNER, config());
    expect(await resolveOrviloProviderBinding(db, OWNER, 'sandbox')).toMatchObject({ id: row.id });
  });

  it('ignores a stale engine value carried by pre-cutover rows', async () => {
    // `selection.engine` is dead data — a row pinned to 'codex-app-server'
    // before the Prime cutover still resolves for an embedded run.
    const [row] = await insertBinding(OWNER, config({ selection: { engine: 'codex-app-server' } }));
    expect(await resolveOrviloProviderBinding(db, OWNER, 'sandbox')).toMatchObject({ id: row.id });
  });

  it('rejects a different target, runtime, disabled row, or owner', async () => {
    await insertBinding(OWNER, config());
    expect(await resolveOrviloProviderBinding(db, OWNER, 'device')).toBeUndefined();
    expect(await resolveOrviloProviderBinding(db, OWNER, 'local')).toBeUndefined();
    expect(await resolveOrviloProviderBinding(db, OUTSIDER, 'sandbox')).toBeUndefined();

    await insertBinding(OWNER, config({ enabled: false }));
    const hits = await resolveOrviloProviderBinding(db, OWNER, 'device');
    expect(hits).toBeUndefined();
  });

  it('narrows by the requested model route', async () => {
    const [first] = await insertBinding(OWNER, config());
    await insertBinding(OWNER, config({ model: 'other-model', name: 'Other' }));
    expect(
      await resolveOrviloProviderBinding(db, OWNER, 'sandbox', { model: MODEL_ID }),
    ).toMatchObject({ id: first.id });
    expect(
      await resolveOrviloProviderBinding(db, OWNER, 'sandbox', { model: 'no-such-model' }),
    ).toBeUndefined();
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

  it('refuses a disabled binding — enabled is re-checked at claim time', async () => {
    const cred = await createCredential(OWNER);
    const [row] = await insertBinding(
      OWNER,
      config({ enabled: false, secretReference: `credential:${cred.id}` }),
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

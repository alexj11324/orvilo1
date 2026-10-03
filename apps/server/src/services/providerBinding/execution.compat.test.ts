// @vitest-environment node
import { randomBytes } from 'node:crypto';

import type { ProviderBindingConfig } from '@orvilo/types';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '@/database/core/getTestDB';
import { CredentialModel } from '@/database/models/credential';
import { ProviderBindingModel } from '@/database/models/providerBinding';
import { credentials, providerBindings, users } from '@/database/schemas';
import type { OrviloDatabase } from '@/database/type';

import { issueBindingExecution, resolveOrviloProviderBinding } from './execution';

/**
 * Pre-cutover-row compatibility coverage. Rows written before the Prime
 * cutover may carry `selection.engine`, `target: 'local' | 'device'`, and
 * `deviceId` pins from the retired BYOK/device-mint surface. The canonical
 * contract ignores dead fields without rejecting the row, and only
 * `runtime: 'orvilo'` + the requested embedded target (`'sandbox'`) +
 * `enabled` rows ever resolve.
 */
const db: OrviloDatabase = await getTestDB();

let originalSecret: string | undefined;

const OWNER = 'byok-exec-owner';
const OUTSIDER = 'byok-exec-outsider';
const MODEL_ID = 'byok-model-1';
const ENDPOINT = 'https://byok.test/v1/';

type BindingSelection = ProviderBindingConfig['selection'];

const bindConfig = (
  overrides: Omit<Partial<ProviderBindingConfig>, 'selection'> & {
    selection?: Partial<BindingSelection>;
  },
  secretReference: string,
): ProviderBindingConfig => ({
  enabled: true,
  endpoint: ENDPOINT,
  model: MODEL_ID,
  name: 'BYOK execution fixture',
  provider: 'mock',
  secretReference,
  ...overrides,
  selection: {
    deviceId: overrides.selection?.deviceId,
    effort: overrides.selection?.effort ?? 'default',
    engine: overrides.selection?.engine,
    mode: overrides.selection?.mode ?? 'default',
    runtime: overrides.selection?.runtime ?? 'orvilo',
    speed: overrides.selection?.speed ?? 'default',
    target: overrides.selection?.target ?? 'sandbox',
  },
});

const insertBinding = (userId: string, config: ProviderBindingConfig) =>
  db.insert(providerBindings).values({ config, userId }).returning();

const createCredential = (
  userId: string,
  type: 'kv-env' | 'kv-header',
  values: Record<string, string>,
) =>
  new CredentialModel(db, userId).create({
    key: `key_${randomBytes(4).toString('hex')}`,
    name: 'Fixture credential',
    payload: { values },
    type,
  });

const cleanup = async () => {
  await db.delete(providerBindings).where(inArray(providerBindings.userId, [OWNER, OUTSIDER]));
  await db.delete(credentials).where(inArray(credentials.ownerUserId, [OWNER, OUTSIDER]));
  await db.delete(users).where(inArray(users.id, [OWNER, OUTSIDER]));
};

beforeAll(() => {
  originalSecret = process.env.KEY_VAULTS_SECRET;
  process.env.KEY_VAULTS_SECRET = randomBytes(32).toString('base64');
});

afterAll(() => {
  if (originalSecret === undefined) delete process.env.KEY_VAULTS_SECRET;
  else process.env.KEY_VAULTS_SECRET = originalSecret;
});

beforeEach(async () => {
  await db.insert(users).values([{ id: OWNER }, { id: OUTSIDER }]);
});

afterEach(cleanup);

const seedEnabled = async (
  selection: Partial<BindingSelection> = {},
  credValues: Record<string, string> = { OPENAI_API_KEY: 'sk-live' },
  credType: 'kv-env' | 'kv-header' = 'kv-env',
) => {
  const cred = await createCredential(OWNER, credType, credValues);
  const [row] = await insertBinding(
    OWNER,
    bindConfig({ secretReference: `credential:${cred.id}`, selection }, `credential:${cred.id}`),
  );
  return row;
};

describe('resolveOrviloProviderBinding — pre-cutover rows', () => {
  it('a row carrying the retired engine key still resolves for embedded dispatch', async () => {
    // Pre-cutover writers stamped `selection.engine`; it is dead data that
    // must not narrow the match.
    const row = await seedEnabled({ engine: 'codex-app-server' });

    const resolution = await resolveOrviloProviderBinding(db, OWNER, 'sandbox');
    expect(resolution?.id).toBe(row.id);
  });

  it('rows written for the retired local/device mint arms never resolve embedded', async () => {
    // `target: 'local'` and `target: 'device'` rows belonged to the deleted
    // device-spawn BYOK surface; embedded dispatch always queries 'sandbox'.
    await seedEnabled({ target: 'local' });
    await seedEnabled({ deviceId: 'dev-2', target: 'device' });

    expect(await resolveOrviloProviderBinding(db, OWNER, 'sandbox')).toBeUndefined();
  });

  it('the most recently updated matching binding wins', async () => {
    const cred = await createCredential(OWNER, 'kv-env', { OPENAI_API_KEY: 'sk-live' });
    const secretReference = `credential:${cred.id}`;
    const [older] = await insertBinding(OWNER, bindConfig({ secretReference }, secretReference));
    const [newer] = await insertBinding(
      OWNER,
      bindConfig({ name: 'Newer', secretReference }, secretReference),
    );
    // Force deterministic ordering regardless of insert timestamps.
    await db
      .update(providerBindings)
      .set({ updatedAt: new Date(Date.now() - 60_000) })
      .where(eq(providerBindings.id, newer.id));

    const candidate = await resolveOrviloProviderBinding(db, OWNER, 'sandbox');
    expect(candidate?.id).toBe(older.id);
  });
});

describe('issueBindingExecution — mint-time fence', () => {
  it('a stale pinned revision never issues credentials', async () => {
    const row = await seedEnabled();
    const stale = row.revision;
    // Simulate a concurrent config edit bumping the revision.
    await db
      .update(providerBindings)
      .set({ revision: row.revision + 1 })
      .where(eq(providerBindings.id, row.id));

    const issued = await issueBindingExecution(db, {
      bindingId: row.id,
      bindingRevision: stale,
      ownerId: OWNER,
      tenantId: 'ws',
    });
    expect(issued).toBeUndefined();
  });

  it('a binding deleted after selection never issues credentials', async () => {
    const row = await seedEnabled();
    await db.delete(providerBindings).where(eq(providerBindings.id, row.id));

    const issued = await issueBindingExecution(db, {
      bindingId: row.id,
      bindingRevision: row.revision,
      ownerId: OWNER,
      tenantId: 'ws',
    });
    expect(issued).toBeUndefined();
  });

  it('a binding disabled after selection never issues credentials', async () => {
    const row = await seedEnabled();
    await new ProviderBindingModel(db, OWNER).setEnabled(row.id, false);

    const issued = await issueBindingExecution(db, {
      bindingId: row.id,
      bindingRevision: row.revision,
      ownerId: OWNER,
      tenantId: 'ws',
    });
    expect(issued).toBeUndefined();
  });

  it('a binding pinning a foreign credential never issues credentials', async () => {
    const foreign = await createCredential(OUTSIDER, 'kv-env', { OPENAI_API_KEY: 'sk-other' });
    const [row] = await insertBinding(
      OWNER,
      bindConfig({ secretReference: `credential:${foreign.id}` }, `credential:${foreign.id}`),
    );

    const issued = await issueBindingExecution(db, {
      bindingId: row.id,
      bindingRevision: row.revision,
      ownerId: OWNER,
      tenantId: 'ws',
    });
    expect(issued).toBeUndefined();
  });
});

describe('ProviderBindingModel.setEnabled — runtime gate without revision bump', () => {
  it('flips enabled in stored config while keeping the revision stable', async () => {
    const row = await seedEnabled();
    const model = new ProviderBindingModel(db, OWNER);

    const updated = await model.setEnabled(row.id, false);
    expect(updated?.config.enabled).toBe(false);
    expect(updated?.revision).toBe(row.revision);

    const back = await model.setEnabled(row.id, true);
    expect(Boolean(back?.config.enabled)).toBe(true);
    expect(back?.revision).toBe(row.revision);
  });
});

// @vitest-environment node
import { randomBytes } from 'node:crypto';

import type { ProviderBindingConfig } from '@orvilo/types';
import { inArray } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '@/database/core/getTestDB';
import { CredentialModel } from '@/database/models/credential';
import { ProviderBindingModel } from '@/database/models/providerBinding';
import { credentials, providerBindings, users } from '@/database/schemas';
import type { OrviloDatabase } from '@/database/type';

import { issueBindingExecution, resolveOrviloProviderBinding } from './execution';

/**
 * End-to-end acceptance for the embedded Prime binding path: an enabled
 * `runtime: 'orvilo'` + `target: 'sandbox'` binding resolves for the run,
 * then issues a revision-fenced contract binding the broker consumes. No
 * credentials materialize on the server — the issued binding carries only
 * the vault `secretReference`.
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

const createCredential = (userId: string, values: Record<string, string>) =>
  new CredentialModel(db, userId).create({
    key: `key_${randomBytes(4).toString('hex')}`,
    name: 'Fixture credential',
    payload: { values },
    type: 'kv-env',
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
  overrides: { model?: string } = {},
) => {
  const cred = await createCredential(OWNER, { OPENAI_API_KEY: 'sk-live' });
  const [row] = await insertBinding(
    OWNER,
    bindConfig(
      {
        ...(overrides.model === undefined ? {} : { model: overrides.model }),
        selection,
      },
      `credential:${cred.id}`,
    ),
  );
  return row;
};

describe('resolve → issue — the embedded dispatch binding path', () => {
  it('an enabled orvilo+sandbox binding resolves and issues a contract binding', async () => {
    const row = await seedEnabled();

    const resolved = await resolveOrviloProviderBinding(db, OWNER, 'sandbox');
    expect(resolved?.id).toBe(row.id);
    expect(resolved?.config.model).toBe(MODEL_ID);
    expect(resolved?.config.provider).toBe('mock');

    const issued = await issueBindingExecution(db, {
      bindingId: resolved!.id,
      bindingRevision: resolved!.revision,
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
      secretReference: row.config.secretReference,
      tenantId: 'ws-run-tenant',
    });
  });

  it('a run pinning the binding model narrows to that row', async () => {
    const row = await seedEnabled();
    await seedEnabled({ engine: 'claude-sdk' }, { model: 'byok-model-2' });
    // `selection.engine` on either row is dead data — narrowing is by the
    // model route only.
    const resolved = await resolveOrviloProviderBinding(db, OWNER, 'sandbox', {
      model: MODEL_ID,
    });
    expect(resolved?.id).toBe(row.id);
  });

  it('a binding that moved under the claim refuses to issue', async () => {
    const row = await seedEnabled();
    const resolved = await resolveOrviloProviderBinding(db, OWNER, 'sandbox');
    expect(resolved?.id).toBe(row.id);

    // A concurrent edit bumps the revision between resolve and issue.
    await new ProviderBindingModel(db, OWNER).update(row.id, row.revision, {
      ...row.config,
      name: 'Renamed under the claim',
    });

    const issued = await issueBindingExecution(db, {
      bindingId: row.id,
      bindingRevision: resolved!.revision,
      ownerId: OWNER,
      tenantId: 'ws',
    });
    expect(issued).toBeUndefined();
  });

  it('a binding disabled after resolution refuses to issue', async () => {
    const row = await seedEnabled();
    const resolved = await resolveOrviloProviderBinding(db, OWNER, 'sandbox');
    expect(resolved?.id).toBe(row.id);

    await new ProviderBindingModel(db, OWNER).setEnabled(row.id, false);

    const issued = await issueBindingExecution(db, {
      bindingId: row.id,
      bindingRevision: resolved!.revision,
      ownerId: OWNER,
      tenantId: 'ws',
    });
    expect(issued).toBeUndefined();
    expect(await resolveOrviloProviderBinding(db, OWNER, 'sandbox')).toBeUndefined();
  });

  it('another user’s binding never resolves or issues for the run', async () => {
    const row = await seedEnabled();

    expect(await resolveOrviloProviderBinding(db, OUTSIDER, 'sandbox')).toBeUndefined();
    const issued = await issueBindingExecution(db, {
      bindingId: row.id,
      bindingRevision: row.revision,
      ownerId: OUTSIDER,
      tenantId: 'ws',
    });
    expect(issued).toBeUndefined();
  });
});

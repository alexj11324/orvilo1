// @vitest-environment node
import { randomBytes } from 'node:crypto';

import type { ProviderBindingConfig } from '@orvilo/types';
import { eq, inArray } from 'drizzle-orm';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '@/database/core/getTestDB';
import { CredentialModel } from '@/database/models/credential';
import { ProviderBindingModel } from '@/database/models/providerBinding';
import { credentials, providerBindings, users } from '@/database/schemas';
import type { OrviloDatabase } from '@/database/type';

import {
  issueBindingExecution,
  type OrviloBindingTarget,
  resolveOrviloProviderBinding,
  selectOrviloProviderBinding,
} from './execution';

const db: OrviloDatabase = await getTestDB();

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
  enabled: false,
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

// Rows are inserted directly: the input schema pins `enabled: false`, while
// execution fixtures need the post-verification `enabled: true` state.
const insertBinding = async (userId: string, config: ProviderBindingConfig, enabled = false) => {
  const row = (
    await db
      .insert(providerBindings)
      .values({
        config: enabled ? { ...config, enabled: true } : config,
        userId,
      })
      .returning()
  )[0]!;
  return row;
};

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

beforeAll(async () => {
  process.env.KEY_VAULTS_SECRET = randomBytes(32).toString('base64');
});

beforeEach(async () => {
  await db.insert(users).values([{ id: OWNER }, { id: OUTSIDER }]);
});

afterEach(cleanup);

const SANDBOX: OrviloBindingTarget = { kind: 'sandbox' };
const DEVICE: OrviloBindingTarget = { deviceId: 'dev-1', kind: 'device' };

const seedEnabled = async (
  selection: Partial<BindingSelection> = {},
  credValues: Record<string, string> = { OPENAI_API_KEY: 'sk-live' },
  credType: 'kv-env' | 'kv-header' = 'kv-env',
) => {
  const cred = await createCredential(OWNER, credType, credValues);
  return insertBinding(
    OWNER,
    bindConfig({ secretReference: `credential:${cred.id}`, selection }, `credential:${cred.id}`),
    true,
  );
};

describe('resolveOrviloProviderBinding — applies enabled bindings', () => {
  it('kv-env + claude-sdk mints Anthropic env only for the device target', async () => {
    const row = await seedEnabled({ target: 'local' });

    // Sandbox dispatch issues the descriptor alone — credentials are served
    // through the embedded inference broker, never through process env.
    const sandboxResolution = await resolveOrviloProviderBinding(
      db,
      OWNER,
      'claude-sdk',
      SANDBOX,
    );
    expect(sandboxResolution.status).toBe('none');

    const resolution = await resolveOrviloProviderBinding(db, OWNER, 'claude-sdk', DEVICE);

    expect(resolution.status).toBe('applied');
    if (resolution.status !== 'applied') return;
    const { execution } = resolution;
    expect(execution.bindingId).toBe(row.id);
    expect(execution.revision).toBe(row.revision);
    expect(execution.provider).toBe('mock');
    expect(execution.model).toBe(MODEL_ID);
    expect(execution.endpoint).toBe('https://byok.test/v1');
    expect(execution.env).toMatchObject({
      // Anthropic SDK base URL is the endpoint minus its /v1 suffix.
      ANTHROPIC_BASE_URL: 'https://byok.test',
      ANTHROPIC_API_KEY: 'sk-live',
      ANTHROPIC_AUTH_TOKEN: 'sk-live',
      ANTHROPIC_MODEL: MODEL_ID,
      ANTHROPIC_SMALL_FAST_MODEL: MODEL_ID,
      CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST: '1',
      CLAUDE_CODE_USE_BEDROCK: '0',
      CLAUDE_CODE_USE_MANTLE: '0',
      CLAUDE_CODE_USE_VERTEX: '0',
    });
    // The broker's mapped headers also travel verbatim as custom headers.
    expect(execution.env.ANTHROPIC_CUSTOM_HEADERS).toBe(
      'Authorization: Bearer sk-live\nx-api-key: sk-live',
    );
  });

  it('kv-header + claude-sdk forwards stored headers verbatim, minus reserved ones', async () => {
    await seedEnabled(
      { target: 'local' },
      {
        'Authorization': 'Bearer hdr-tok',
        'Host': 'spoof.invalid',
        'x-tenant': 'tenant-9',
      },
      'kv-header',
    );

    const resolution = await resolveOrviloProviderBinding(db, OWNER, 'claude-sdk', DEVICE);

    expect(resolution.status).toBe('applied');
    if (resolution.status !== 'applied') return;
    const custom = resolution.execution.env.ANTHROPIC_CUSTOM_HEADERS ?? '';
    expect(custom).toContain('Authorization: Bearer hdr-tok');
    expect(custom).toContain('x-tenant: tenant-9');
    expect(custom).not.toContain('spoof.invalid');
    expect(resolution.execution.env.ANTHROPIC_AUTH_TOKEN).toBe('hdr-tok');
  });

  it('kv-env + codex-app-server mints a codex provider via env_key + env_http_headers', async () => {
    await seedEnabled({ target: 'local' });

    const resolution = await resolveOrviloProviderBinding(db, OWNER, 'codex-app-server', DEVICE);

    expect(resolution.status).toBe('applied');
    if (resolution.status !== 'applied') return;
    const { env, execArgs } = resolution.execution;
    expect(env.ORVILO_BYOK_API_KEY).toBe('sk-live');
    // Secrets ride in env vars only — argv carries env var NAMES, never values.
    expect(JSON.stringify(execArgs)).not.toContain('sk-live');
    expect(execArgs).toEqual(
      expect.arrayContaining([
        '--agent-arg=-c',
        '--agent-arg=model_provider="orvilo_byok"',
        '--agent-arg=model_providers.orvilo_byok.base_url="https://byok.test/v1"',
        '--agent-arg=model_providers.orvilo_byok.wire_api="chat"',
        '--agent-arg=model_providers.orvilo_byok.env_key="ORVILO_BYOK_API_KEY"',
      ]),
    );
    // Forwarded headers land as an env_http_headers inline table whose values
    // are ORVILO_BYOK_H_<n> env var names — the secret itself is only in env.
    expect(
      execArgs.some((arg) => arg.includes('env_http_headers') && arg.includes('ORVILO_BYOK_H_1')),
    ).toBe(true);
    expect(env.ORVILO_BYOK_H_1).toBe('sk-live');
  });

  it('sandbox dispatch issues the descriptor alone — empty env and execArgs', async () => {
    const row = await seedEnabled();

    const resolution = await resolveOrviloProviderBinding(db, OWNER, 'claude-sdk', SANDBOX);

    expect(resolution.status).toBe('applied');
    if (resolution.status !== 'applied') return;
    expect(resolution.execution.bindingId).toBe(row.id);
    expect(resolution.execution.endpoint).toBe('https://byok.test/v1');
    expect(resolution.execution.env).toEqual({});
    expect(resolution.execution.execArgs).toEqual([]);
  });
});

describe('resolveOrviloProviderBinding — selection fencing', () => {
  it('disabled bindings never resolve', async () => {
    const cred = await createCredential(OWNER, 'kv-env', { OPENAI_API_KEY: 'sk-live' });
    await insertBinding(
      OWNER,
      bindConfig({ secretReference: `credential:${cred.id}` }, `credential:${cred.id}`),
    );

    const resolution = await resolveOrviloProviderBinding(db, OWNER, 'claude-sdk', SANDBOX);
    expect(resolution.status).toBe('none');
  });

  it('a binding disabled after verification stops resolving', async () => {
    const row = await seedEnabled();
    await new ProviderBindingModel(db, OWNER).setEnabled(row.id, false);

    const resolution = await resolveOrviloProviderBinding(db, OWNER, 'claude-sdk', SANDBOX);
    expect(resolution.status).toBe('none');
  });

  it('another user’s binding is invisible to the run', async () => {
    await seedEnabled();

    const resolution = await resolveOrviloProviderBinding(db, OUTSIDER, 'claude-sdk', SANDBOX);
    expect(resolution.status).toBe('none');
  });

  it('a binding pinning a foreign credential is denied at mint, loudly', async () => {
    const foreign = await createCredential(OUTSIDER, 'kv-env', { OPENAI_API_KEY: 'sk-other' });
    await insertBinding(
      OWNER,
      bindConfig({ secretReference: `credential:${foreign.id}` }, `credential:${foreign.id}`),
      true,
    );

    const resolution = await resolveOrviloProviderBinding(db, OWNER, 'claude-sdk', SANDBOX);
    expect(resolution.status).toBe('unavailable');
  });

  it('ACP/external runtimes never match — only selection.runtime orvilo applies', async () => {
    const cred = await createCredential(OWNER, 'kv-env', { OPENAI_API_KEY: 'sk-live' });
    await insertBinding(
      OWNER,
      bindConfig(
        { secretReference: `credential:${cred.id}`, selection: { runtime: 'claude-code' } },
        `credential:${cred.id}`,
      ),
      true,
    );

    const resolution = await resolveOrviloProviderBinding(db, OWNER, 'claude-sdk', SANDBOX);
    expect(resolution.status).toBe('none');
  });

  it('engine mismatch denies; engine-unset bindings match either engine', async () => {
    const cred = await createCredential(OWNER, 'kv-env', { OPENAI_API_KEY: 'sk-live' });
    await insertBinding(
      OWNER,
      bindConfig(
        { secretReference: `credential:${cred.id}`, selection: { engine: 'codex-app-server' } },
        `credential:${cred.id}`,
      ),
      true,
    );

    expect((await resolveOrviloProviderBinding(db, OWNER, 'claude-sdk', SANDBOX)).status).toBe(
      'none',
    );
    expect(
      (await resolveOrviloProviderBinding(db, OWNER, 'codex-app-server', SANDBOX)).status,
    ).toBe('applied');
  });

  it('target matching: sandbox binds sandbox, local binds any device, device pins deviceId', async () => {
    const cred = await createCredential(OWNER, 'kv-env', { OPENAI_API_KEY: 'sk-live' });
    const secretReference = `credential:${cred.id}`;

    // sandbox binding does not apply to a device dispatch.
    await seedEnabled();
    expect(
      (
        await resolveOrviloProviderBinding(db, OWNER, 'claude-sdk', {
          deviceId: 'dev-1',
          kind: 'device',
        })
      ).status,
    ).toBe('none');

    // local binding applies to any user device.
    await insertBinding(
      OWNER,
      bindConfig({ secretReference, selection: { target: 'local' } }, secretReference),
      true,
    );
    expect(
      (
        await resolveOrviloProviderBinding(db, OWNER, 'claude-sdk', {
          deviceId: 'dev-1',
          kind: 'device',
        })
      ).status,
    ).toBe('applied');

    // device binding pins the registered device id.
    const pinned = await insertBinding(
      OWNER,
      bindConfig(
        { secretReference, selection: { deviceId: 'dev-2', target: 'device' } },
        secretReference,
      ),
      true,
    );
    // dev-1 keeps matching the earlier `local` binding — dev-2's pin does not apply.
    const offPin = await resolveOrviloProviderBinding(db, OWNER, 'claude-sdk', {
      deviceId: 'dev-1',
      kind: 'device',
    });
    expect(offPin.status).toBe('applied');
    if (offPin.status === 'applied') {
      expect(offPin.execution.bindingId).not.toBe(pinned.id);
    }
    // dev-2 matches both `local` and the pin — the newer (pinned) binding wins.
    await db
      .update(providerBindings)
      .set({ updatedAt: new Date(Date.now() + 60_000) })
      .where(eq(providerBindings.id, pinned.id));
    const resolution = await resolveOrviloProviderBinding(db, OWNER, 'claude-sdk', {
      deviceId: 'dev-2',
      kind: 'device',
    });
    expect(resolution.status).toBe('applied');
    if (resolution.status === 'applied') {
      expect(resolution.execution.bindingId).toBe(pinned.id);
    }
  });

  it('the most recently updated matching binding wins', async () => {
    const cred = await createCredential(OWNER, 'kv-env', { OPENAI_API_KEY: 'sk-live' });
    const secretReference = `credential:${cred.id}`;
    const older = await insertBinding(
      OWNER,
      bindConfig({ secretReference }, secretReference),
      true,
    );
    const newer = await insertBinding(
      OWNER,
      bindConfig({ name: 'Newer', secretReference }, secretReference),
      true,
    );
    // Force deterministic ordering regardless of insert timestamps.
    await db
      .update(providerBindings)
      .set({ updatedAt: new Date(Date.now() - 60_000) })
      .where(eq(providerBindings.id, newer.id));

    const candidate = await selectOrviloProviderBinding(db, OWNER, 'claude-sdk', SANDBOX);
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

    const issued = await issueBindingExecution(
      db,
      OWNER,
      { id: row.id, revision: stale },
      'claude-sdk',
      SANDBOX,
    );
    expect(issued).toBeUndefined();
  });

  it('a binding deleted after selection never issues credentials', async () => {
    const row = await seedEnabled();
    await db.delete(providerBindings).where(eq(providerBindings.id, row.id));

    const issued = await issueBindingExecution(
      db,
      OWNER,
      { id: row.id, revision: row.revision },
      'claude-sdk',
      SANDBOX,
    );
    expect(issued).toBeUndefined();
  });

  it('a binding disabled after selection never issues credentials', async () => {
    const row = await seedEnabled();
    await new ProviderBindingModel(db, OWNER).setEnabled(row.id, false);

    const issued = await issueBindingExecution(
      db,
      OWNER,
      { id: row.id, revision: row.revision },
      'claude-sdk',
      SANDBOX,
    );
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
    expect(back?.config.enabled).toBe(true);
    expect(back?.revision).toBe(row.revision);
  });
});

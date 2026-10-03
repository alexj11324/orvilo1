// @vitest-environment node
import { randomBytes } from 'node:crypto';
import {
  createServer,
  type IncomingHttpHeaders,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';

import type { ProviderBindingConfig } from '@orvilo/types';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import * as dbAdaptor from '@/database/core/db-adaptor';
import { getTestDB } from '@/database/core/getTestDB';
import { CredentialModel } from '@/database/models/credential';
import { ProviderBindingModel } from '@/database/models/providerBinding';
import { credentials, providerBindings, users } from '@/database/schemas';
import type { OrviloDatabase } from '@/database/type';
import { router } from '@/libs/trpc/lambda';
import { providerBindingRouter } from '@/server/routers/lambda/providerBinding';

import { checkProviderBinding, type ProviderConfigurationComposition } from './configuration';
import { createProviderBindingComposition } from './controlPlane';

const db: OrviloDatabase = await getTestDB();

const OWNER = 'ccp-check-owner';
const OUTSIDER = 'ccp-check-outsider';
const MODEL_ID = 'mock-model-1';
const MODELS_BODY = JSON.stringify({
  data: [{ context_length: 32_768, id: MODEL_ID, max_output_tokens: 8192 }],
});

interface SeenRequest {
  body: string;
  headers: IncomingHttpHeaders;
  method?: string;
  url?: string;
}

let seenRequests: SeenRequest[] = [];
let requiredHeaders: Record<string, string> = {};
let modelsDelayMs = 0;
let modelsStatus = 200;

const respond = (res: ServerResponse, status: number, body: string) => {
  if (res.destroyed) return;
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(body);
};

const provider: Server = createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    seenRequests.push({
      body: Buffer.concat(chunks).toString(),
      headers: req.headers,
      method: req.method,
      url: req.url,
    });
    const authed = Object.entries(requiredHeaders).every(([k, v]) => req.headers[k] === v);
    if (!authed) return respond(res, 401, JSON.stringify({ error: { message: 'invalid key' } }));
    if (req.method === 'GET' && req.url === '/models') {
      if (modelsDelayMs > 0) {
        setTimeout(() => respond(res, modelsStatus, MODELS_BODY), modelsDelayMs);
        return;
      }
      return respond(res, modelsStatus, MODELS_BODY);
    }
    if (req.method === 'POST' && req.url === '/chat/completions') {
      return respond(
        res,
        200,
        JSON.stringify({
          choices: [{ message: { content: 'pong', role: 'assistant' } }],
          usage: { completion_tokens: 1, prompt_tokens: 3 },
        }),
      );
    }
    respond(res, 404, '{}');
  });
});

let port = 0;
const endpoint = (path = '/') => `http://127.0.0.1:${port}${path}`;
const caller = (userId: string) =>
  router({ providerBinding: providerBindingRouter }).createCaller({ userId } as never)
    .providerBinding;

const bindConfig = (
  endpointUrl: string,
  secretReference: string,
  model = MODEL_ID,
): ProviderBindingConfig => ({
  enabled: false,
  endpoint: endpointUrl,
  model,
  name: 'Acceptance fixture',
  provider: 'mock',
  secretReference,
  selection: {
    effort: 'default',
    mode: 'default',
    runtime: 'orvilo',
    speed: 'default',
    target: 'sandbox',
  },
});

// Bindings are inserted directly because providerBindingConfigSchema restricts
// endpoints to https:// — the acceptance rig needs a local plaintext mock.
const insertBinding = async (userId: string, config: ProviderBindingConfig) =>
  (await db.insert(providerBindings).values({ config, userId }).returning())[0]!;

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

let originalSecret: string | undefined;

beforeAll(async () => {
  originalSecret = process.env.KEY_VAULTS_SECRET;
  process.env.KEY_VAULTS_SECRET = randomBytes(32).toString('base64');
  await new Promise<void>((resolve) => provider.listen(0, '127.0.0.1', resolve));
  port = (provider.address() as AddressInfo).port;
});

beforeEach(async () => {
  seenRequests = [];
  requiredHeaders = {};
  modelsDelayMs = 0;
  modelsStatus = 200;
  vi.spyOn(dbAdaptor, 'getServerDB').mockResolvedValue(db);
  await db.insert(users).values([{ id: OWNER }, { id: OUTSIDER }]);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await cleanup();
});

afterAll(async () => {
  if (originalSecret === undefined) delete process.env.KEY_VAULTS_SECRET;
  else process.env.KEY_VAULTS_SECRET = originalSecret;
  await new Promise<void>((resolve, reject) =>
    provider.close((err) => (err ? reject(err) : resolve())),
  );
});

describe('checkConnection real provider round-trip', () => {
  it('kv-header credential decrypts, maps headers, strips reserved ones, yields ready', async () => {
    const cred = await createCredential(OWNER, 'kv-header', {
      'Authorization': 'Bearer live-secret',
      'Host': 'spoof.invalid',
      'x-tenant': 'tenant-9',
    });
    const row = await insertBinding(
      OWNER,
      bindConfig(endpoint('/'), `credential:${cred.id}`), // trailing slash must normalize
    );
    requiredHeaders = { 'authorization': 'Bearer live-secret', 'x-tenant': 'tenant-9' };

    const result = await caller(OWNER).checkConnection({ id: row.id, revision: row.revision });

    expect(result).toMatchObject({
      bindingId: row.id,
      bindingRevision: row.revision,
      status: 'ready',
    });
    expect(result.checkedAt).toBeGreaterThan(0);

    const modelsReq = seenRequests.find((r) => r.url === '/models');
    expect(modelsReq?.method).toBe('GET');
    expect(modelsReq?.headers['authorization']).toBe('Bearer live-secret');
    expect(modelsReq?.headers['x-tenant']).toBe('tenant-9');
    // `Host` is reserved — the stored value must never reach the wire.
    expect(modelsReq?.headers['host']).toBe(`127.0.0.1:${port}`);
  });

  it('a ready check enables the binding for execution without bumping revision', async () => {
    const cred = await createCredential(OWNER, 'kv-env', { PROVIDER_KEY: 'env-secret-7' });
    const row = await insertBinding(OWNER, bindConfig(endpoint(), `credential:${cred.id}`));
    requiredHeaders = { authorization: 'Bearer env-secret-7' };

    const result = await caller(OWNER).checkConnection({ id: row.id, revision: row.revision });
    expect(result.status).toBe('ready');

    const stored = await new ProviderBindingModel(db, OWNER).find(row.id);
    expect(stored?.config.enabled).toBe(true);
    expect(stored?.revision).toBe(row.revision);
  });

  it('an unavailable check leaves the binding disabled', async () => {
    const cred = await createCredential(OWNER, 'kv-env', { PROVIDER_KEY: 'env-secret-7' });
    const row = await insertBinding(OWNER, bindConfig(endpoint(), `credential:${cred.id}`));
    requiredHeaders = { authorization: 'Bearer other-key' };

    const result = await caller(OWNER).checkConnection({ id: row.id, revision: row.revision });
    expect(result.status).toBe('unavailable');

    const stored = await new ProviderBindingModel(db, OWNER).find(row.id);
    expect(stored?.config.enabled).toBe(false);
  });

  it('kv-env credential maps the secret to Authorization Bearer + x-api-key', async () => {
    const cred = await createCredential(OWNER, 'kv-env', {
      OPENAI_API_KEY: 'env-secret-7',
      UNRELATED: 'noise',
    });
    const row = await insertBinding(OWNER, bindConfig(endpoint(), `credential:${cred.id}`));
    requiredHeaders = { 'authorization': 'Bearer env-secret-7', 'x-api-key': 'env-secret-7' };

    const result = await caller(OWNER).checkConnection({ id: row.id, revision: row.revision });

    expect(result.status).toBe('ready');
    const modelsReq = seenRequests.find((r) => r.url === '/models');
    expect(modelsReq?.headers['authorization']).toBe('Bearer env-secret-7');
    expect(modelsReq?.headers['x-api-key']).toBe('env-secret-7');
  });

  it('broker capabilities are driven by the real /models listing', async () => {
    const cred = await createCredential(OWNER, 'kv-env', { PROVIDER_KEY: 'env-secret-7' });
    const row = await insertBinding(OWNER, bindConfig(endpoint(), `credential:${cred.id}`));
    requiredHeaders = { authorization: 'Bearer env-secret-7' };

    const composition = createProviderBindingComposition(db);
    const scope = await composition.authorizeScope(OWNER);
    const caps = await composition.broker.capabilities({
      bindingId: row.id,
      bindingRevision: row.revision,
      schemaVersion: 1,
      scope,
    });

    expect(caps).toEqual({
      ok: true,
      value: [
        {
          images: false,
          maxOutputTokens: 8192,
          modelRoute: MODEL_ID,
          text: true,
          tools: true,
        },
      ],
    });
    expect(seenRequests.some((r) => r.url === '/models')).toBe(true);
  });
});

describe('checkConnection failure matrix — never a green check', () => {
  const seedBinding = async (endpointUrl = endpoint()) => {
    const cred = await createCredential(OWNER, 'kv-env', { PROVIDER_KEY: 'env-secret-7' });
    return insertBinding(OWNER, bindConfig(endpointUrl, `credential:${cred.id}`));
  };

  it('rejected credential (401) yields unavailable and proves a real request happened', async () => {
    const row = await seedBinding();
    requiredHeaders = { authorization: 'Bearer other-key' };

    const result = await caller(OWNER).checkConnection({ id: row.id, revision: row.revision });

    expect(result.status).toBe('unavailable');
    const req = seenRequests.find((r) => r.url === '/models');
    expect(req?.headers['authorization']).toBe('Bearer env-secret-7');
  });

  it('non-2xx provider response yields unavailable', async () => {
    const row = await seedBinding();
    requiredHeaders = { authorization: 'Bearer env-secret-7' };
    modelsStatus = 500;

    const result = await caller(OWNER).checkConnection({ id: row.id, revision: row.revision });
    expect(result.status).toBe('unavailable');
  });

  it('unreachable host yields unavailable', async () => {
    const dead = createServer();
    await new Promise<void>((resolve) => dead.listen(0, '127.0.0.1', resolve));
    const closedPort = (dead.address() as AddressInfo).port;
    await new Promise<void>((resolve) => dead.close(() => resolve()));

    const row = await seedBinding(`http://127.0.0.1:${closedPort}`);

    const result = await caller(OWNER).checkConnection({ id: row.id, revision: row.revision });
    expect(result.status).toBe('unavailable');
    expect(seenRequests).toHaveLength(0);
  });

  it('malformed stored endpoint yields unavailable', async () => {
    const row = await seedBinding('notaurl');

    const result = await caller(OWNER).checkConnection({ id: row.id, revision: row.revision });
    expect(result.status).toBe('unavailable');
  });

  it('slow provider aborted by the request timeout yields unavailable', async () => {
    const row = await seedBinding();
    requiredHeaders = { authorization: 'Bearer env-secret-7' };
    modelsDelayMs = 500;
    // Shrink the 15s provider timeout so the abort path is exercised fast.
    const realTimeout = AbortSignal.timeout.bind(AbortSignal);
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => realTimeout(25));

    const result = await caller(OWNER).checkConnection({ id: row.id, revision: row.revision });

    expect(result.status).toBe('unavailable');
    expect(seenRequests.some((r) => r.url === '/models')).toBe(true);
  });

  it('credential with no usable secret never reaches the provider', async () => {
    const cred = await createCredential(OWNER, 'kv-env', {});
    const row = await insertBinding(OWNER, bindConfig(endpoint(), `credential:${cred.id}`));

    const result = await caller(OWNER).checkConnection({ id: row.id, revision: row.revision });
    expect(result.status).toBe('unavailable');
    expect(seenRequests).toHaveLength(0);
  });
});

describe('scope fencing and revision guards', () => {
  const seedBinding = async () => {
    const cred = await createCredential(OWNER, 'kv-env', { PROVIDER_KEY: 'env-secret-7' });
    const row = await insertBinding(OWNER, bindConfig(endpoint(), `credential:${cred.id}`));
    requiredHeaders = { authorization: 'Bearer env-secret-7' };
    return row;
  };

  it('outsider cannot check a binding owned by another user (router level)', async () => {
    const row = await seedBinding();

    await expect(
      caller(OUTSIDER).checkConnection({ id: row.id, revision: row.revision }),
    ).rejects.toMatchObject({ code: 'CONFLICT', message: 'BINDING_UNAVAILABLE_OR_CHANGED' });
    expect(seenRequests).toHaveLength(0);
  });

  it('principal mismatch inside the broker is denied before any provider call', async () => {
    const row = await seedBinding();

    await expect(
      checkProviderBinding(
        new ProviderBindingModel(db, OWNER),
        OUTSIDER,
        { id: row.id, revision: row.revision },
        createProviderBindingComposition(db),
      ),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED', message: 'PROVIDER_CHECK_UNAVAILABLE' });
    expect(seenRequests).toHaveLength(0);
  });

  it('banned owner is revoked before any provider call', async () => {
    const row = await seedBinding();
    await db.update(users).set({ banned: true }).where(eq(users.id, OWNER));

    await expect(
      caller(OWNER).checkConnection({ id: row.id, revision: row.revision }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED', message: 'PROVIDER_CHECK_UNAVAILABLE' });
    expect(seenRequests).toHaveLength(0);
  });

  it('stale input revision is a conflict', async () => {
    const row = await seedBinding();

    await expect(
      caller(OWNER).checkConnection({ id: row.id, revision: row.revision + 1 }),
    ).rejects.toMatchObject({ code: 'CONFLICT', message: 'BINDING_UNAVAILABLE_OR_CHANGED' });
    expect(seenRequests).toHaveLength(0);
  });

  it('revision drift mid-check is denied by the broker recheck', async () => {
    const row = await seedBinding();
    const real = createProviderBindingComposition(db);
    let bumped = false;
    const composition: ProviderConfigurationComposition = {
      authorizeScope: async (userId) => {
        const scope = await real.authorizeScope(userId);
        if (!bumped) {
          bumped = true;
          await db
            .update(providerBindings)
            .set({ revision: row.revision + 1 })
            .where(eq(providerBindings.id, row.id));
        }
        return scope;
      },
      broker: real.broker,
    };

    await expect(
      checkProviderBinding(
        new ProviderBindingModel(db, OWNER),
        OWNER,
        { id: row.id, revision: row.revision },
        composition,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT', message: 'BINDING_UNAVAILABLE_OR_CHANGED' });
    // The broker denied the drifted revision before the provider request ran.
    expect(seenRequests).toHaveLength(0);
  });

  it('revision drift after the broker result is caught by the post-check reload', async () => {
    const row = await seedBinding();
    const real = createProviderBindingComposition(db);
    const composition: ProviderConfigurationComposition = {
      authorizeScope: real.authorizeScope,
      broker: {
        capabilities: real.broker.capabilities,
        checkBinding: async (request) => {
          const result = await real.broker.checkBinding(request);
          await db
            .update(providerBindings)
            .set({ revision: row.revision + 1 })
            .where(eq(providerBindings.id, row.id));
          return result;
        },
      },
    };

    await expect(
      checkProviderBinding(
        new ProviderBindingModel(db, OWNER),
        OWNER,
        { id: row.id, revision: row.revision },
        composition,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT', message: 'BINDING_UNAVAILABLE_OR_CHANGED' });
  });

  it('missing composition fails closed as PROVIDER_BROKER_UNAVAILABLE', async () => {
    const row = await seedBinding();

    await expect(
      checkProviderBinding(new ProviderBindingModel(db, OWNER), OWNER, {
        id: row.id,
        revision: row.revision,
      }),
    ).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
      message: 'PROVIDER_BROKER_UNAVAILABLE',
    });
    expect(seenRequests).toHaveLength(0);
  });
});

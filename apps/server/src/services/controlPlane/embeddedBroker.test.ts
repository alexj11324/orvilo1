// @vitest-environment node
import { randomBytes } from 'node:crypto';
import {
  createServer,
  type IncomingHttpHeaders,
  type Server,
  type ServerResponse,
} from 'node:http';

import type {
  ExecutionFence,
  InferenceEvent,
  RuntimeSession,
} from '@orvilo/agent-execution/controlPlane';
import { CONTROL_PLANE_VERSION } from '@orvilo/agent-execution/controlPlane';
import type { SanitizedInferenceRequest } from '@orvilo/agent-execution/controlPlane/harnessProtocol';
import type { ProviderBindingConfig } from '@orvilo/types';
import { eq, inArray, sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '@/database/core/getTestDB';
import { CredentialModel } from '@/database/models/credential';
import { credentials, providerBindings, taskDispatches, workspaces } from '@/database/schemas';
import type { OrviloDatabase } from '@/database/type';
import { cleanupTestUser } from '@/server/routers/lambda/__tests__/integration/setup';

import type { CanonicalRunBinding } from './canonicalRun';
import { createCanonicalRunFixture } from './canonicalRun.test-utils';
import { createEmbeddedInferenceBridge } from './embeddedBroker';

const db: OrviloDatabase = await getTestDB();

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

interface Gate {
  promise: Promise<void>;
  release: () => void;
}
const gate = (): Gate => {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
};

let seenRequests: SeenRequest[] = [];
let inferResponsesAborted = 0;
/** Set per test — drives the SSE reply for POST /chat/completions. */
let inferPlan: ((res: ServerResponse) => Promise<void>) | undefined;

const sseDelta = (text: string) =>
  `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;
const sseUsage = (promptTokens: number, completionTokens: number) =>
  `data: ${JSON.stringify({ usage: { completion_tokens: completionTokens, prompt_tokens: promptTokens } })}\n\n`;

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
    if (req.method === 'GET' && req.url === '/models') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(MODELS_BODY);
      return;
    }
    if (req.method === 'POST' && req.url === '/chat/completions') {
      res.on('close', () => {
        if (!res.writableFinished) inferResponsesAborted += 1;
      });
      const plan = inferPlan;
      if (!plan) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{}');
        return;
      }
      void plan(res).catch(() => {
        if (!res.destroyed) res.destroy();
      });
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end('{}');
  });
});

let port = 0;
const endpoint = (path = '/') => `http://127.0.0.1:${port}${path}`;

const bindConfig = (
  endpointUrl: string,
  secretReference: string,
  overrides?: {
    engine?: ProviderBindingConfig['selection']['engine'];
    runtime?: ProviderBindingConfig['selection']['runtime'];
    target?: ProviderBindingConfig['selection']['target'];
  },
): ProviderBindingConfig => ({
  enabled: false,
  endpoint: endpointUrl,
  model: MODEL_ID,
  name: 'Embedded broker fixture',
  provider: 'mock',
  secretReference,
  selection: {
    effort: 'default',
    engine: overrides?.engine,
    mode: 'default',
    runtime: overrides?.runtime ?? 'orvilo',
    speed: 'default',
    target: overrides?.target ?? 'sandbox',
  },
});

// Bindings insert directly: providerBindingConfigSchema restricts endpoints to
// https://, the test rig needs a local plaintext mock.
const insertBinding = async (userId: string, config: ProviderBindingConfig) =>
  (await db.insert(providerBindings).values({ config, userId }).returning())[0]!;

const createCredential = (userId: string, values: Record<string, string>) =>
  new CredentialModel(db, userId).create({
    key: `key_${randomBytes(4).toString('hex')}`,
    name: 'Fixture credential',
    payload: { values },
    type: 'kv-env',
  });

/** The fence the runtime session carries — identical to the canonical snapshot
 * fields `withRun` stamps, as the real launch attaches it host-side. */
const fenceFor = (b: CanonicalRunBinding): ExecutionFence => ({
  epoch: b.executionEpoch,
  grantId: b.grantId,
  leaseId: b.runtimeLeaseId,
  ownerId: b.runtimeOwnerId,
  policyRevision: b.policyRevision,
  principalId: b.userId,
  stateRevision: b.stateRevision,
  taskId: b.taskId,
  tenantId: b.workspaceId,
});

const sessionFor = (b: CanonicalRunBinding): RuntimeSession => ({
  fence: fenceFor(b),
  runtimeId: 'prime-embedded',
  sessionId: 'session-1',
});

const sanitizedRequest = (
  modelRoute = MODEL_ID,
  maxOutputTokens = 100,
): SanitizedInferenceRequest => ({
  maxOutputTokens,
  messages: [{ content: 'hello', role: 'user' }],
  modelRoute,
  requestId: 'req-1',
});

const collectInfer = async (
  stream: AsyncIterable<InferenceEvent>,
  limit = 16,
): Promise<InferenceEvent[]> => {
  const events: InferenceEvent[] = [];
  const iterator = stream[Symbol.asyncIterator]();
  for (let i = 0; i < limit; i += 1) {
    const step = await iterator.next();
    if (step.done) return events;
    events.push(step.value);
  }
  throw new Error('infer stream did not terminate');
};

let binding: CanonicalRunBinding | undefined;
let originalSecret: string | undefined;

beforeAll(async () => {
  originalSecret = process.env.KEY_VAULTS_SECRET;
  process.env.KEY_VAULTS_SECRET = randomBytes(32).toString('base64');
  await new Promise<void>((resolve) => provider.listen(0, '127.0.0.1', resolve));
  const address = provider.address();
  if (typeof address !== 'object' || address === null) throw new Error('provider not listening');
  port = address.port;
});

beforeEach(() => {
  seenRequests = [];
  inferResponsesAborted = 0;
  inferPlan = undefined;
});

afterEach(async () => {
  inferPlan = undefined;
  if (binding) {
    await db.delete(providerBindings).where(inArray(providerBindings.userId, [binding.userId]));
    await db.delete(credentials).where(eq(credentials.ownerUserId, binding.userId));
    await db.delete(workspaces).where(eq(workspaces.id, binding.workspaceId));
    await cleanupTestUser(db, binding.userId);
    binding = undefined;
  }
});

afterAll(async () => {
  if (originalSecret === undefined) delete process.env.KEY_VAULTS_SECRET;
  else process.env.KEY_VAULTS_SECRET = originalSecret;
  await new Promise<void>((resolve, reject) =>
    provider.close((err) => (err ? reject(err) : resolve())),
  );
});

const seed = async () => {
  const run = await createCanonicalRunFixture(db);
  binding = run;
  const cred = await createCredential(run.userId, { PROVIDER_KEY: 'env-secret-7' });
  const row = await insertBinding(run.userId, bindConfig(endpoint(), `credential:${cred.id}`));
  return { cred, row, run };
};

describe('embedded inference bridge composition', () => {
  it('fails loudly when no orvilo binding resolves — no env-key fallback', async () => {
    const run = await createCanonicalRunFixture(db);
    binding = run;
    const result = await createEmbeddedInferenceBridge({ binding: run, database: db });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('unauthorized');
    // No provider traffic may occur.
    expect(seenRequests).toHaveLength(0);
  });

  it('pins the issued model route into initModel and admits only that route', async () => {
    const { row } = await seed();
    const result = await createEmbeddedInferenceBridge({ binding: binding!, database: db });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const bridge = result.value;
    expect(bridge.initModel).toEqual({ id: MODEL_ID, maxOutputTokens: 8192 });

    const wrong = bridge.buildInferenceRequest({
      request: sanitizedRequest('other-model'),
      session: sessionFor(binding!),
    });
    expect(wrong.ok).toBe(false);

    const built = bridge.buildInferenceRequest({
      request: sanitizedRequest(),
      session: sessionFor(binding!),
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.value).toEqual({
      bindingRevision: row.revision,
      fence: fenceFor(binding!),
      maxOutputTokens: 100,
      messages: [{ content: 'hello', role: 'user' }],
      modelRoute: MODEL_ID,
      requestId: 'req-1',
      schemaVersion: CONTROL_PLANE_VERSION,
    });
  });
});

describe('embedded broker inference round-trip', () => {
  it('streams SSE text+usage end-to-end with decrypted headers host-side', async () => {
    await seed();
    inferPlan = async (res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write(sseDelta('Hello '));
      res.write(sseDelta('world.'));
      res.write(sseUsage(7, 4));
      res.write('data: [DONE]\n\n');
      res.end();
    };
    const result = await createEmbeddedInferenceBridge({ binding: binding!, database: db });
    if (!result.ok) throw new Error('bridge failed to compose');
    const built = result.value.buildInferenceRequest({
      request: sanitizedRequest(),
      session: sessionFor(binding!),
    });
    if (!built.ok) throw new Error('admission failed');

    const events = await collectInfer(result.value.inferenceBroker.infer(built.value));
    expect(events).toEqual([
      { type: 'text', text: 'Hello ' },
      { type: 'text', text: 'world.' },
      { type: 'usage', inputTokens: 7, outputTokens: 4 },
    ]);

    const inferCall = seenRequests.find((r) => r.url === '/chat/completions');
    expect(inferCall?.headers.authorization).toBe('Bearer env-secret-7');
    expect(inferCall?.headers['x-api-key']).toBe('env-secret-7');
    const body: unknown = JSON.parse(inferCall?.body ?? '{}');
    expect(body).toMatchObject({
      max_tokens: 100,
      messages: [{ content: 'hello', role: 'user' }],
      model: MODEL_ID,
      stream: true,
    });
    expect(inferResponsesAborted).toBe(0);
  });

  it('mid-stream binding revocation aborts the stream', async () => {
    const { row } = await seed();
    const chunk = gate();
    inferPlan = async (res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write(sseDelta('a'));
      await chunk.promise;
      res.write(sseDelta('b'));
      res.write('data: [DONE]\n\n');
      res.end();
    };
    const result = await createEmbeddedInferenceBridge({ binding: binding!, database: db });
    if (!result.ok) throw new Error('bridge failed to compose');
    const built = result.value.buildInferenceRequest({
      request: sanitizedRequest(),
      session: sessionFor(binding!),
    });
    if (!built.ok) throw new Error('admission failed');

    const iterator = result.value.inferenceBroker.infer(built.value)[Symbol.asyncIterator]();
    const first = await iterator.next();
    expect(first.done).toBe(false);
    expect(first.value).toEqual({ type: 'text', text: 'a' });

    // Revision fence: the row moves under the in-flight stream.
    await db
      .update(providerBindings)
      .set({ revision: sql`${providerBindings.revision} + 1` })
      .where(eq(providerBindings.id, row.id));
    chunk.release();

    const second = await iterator.next();
    expect(second.done).toBe(false);
    if (second.done) return;
    expect(second.value.type).toBe('error');
    if (second.value.type !== 'error') return;
    expect(second.value.error.code).toBe('unauthorized');
    const third = await iterator.next();
    expect(third.done).toBe(true);
  });

  it('mid-stream run revocation (stopped task) yields revoked, not provider text', async () => {
    await seed();
    const chunk = gate();
    inferPlan = async (res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write(sseDelta('a'));
      await chunk.promise;
      res.write(sseDelta('b'));
      res.write('data: [DONE]\n\n');
      res.end();
    };
    const result = await createEmbeddedInferenceBridge({ binding: binding!, database: db });
    if (!result.ok) throw new Error('bridge failed to compose');
    const built = result.value.buildInferenceRequest({
      request: sanitizedRequest(),
      session: sessionFor(binding!),
    });
    if (!built.ok) throw new Error('admission failed');

    const iterator = result.value.inferenceBroker.infer(built.value)[Symbol.asyncIterator]();
    const first = await iterator.next();
    expect(first.value).toEqual({ type: 'text', text: 'a' });

    // Canonical stop is the dispatch leaving its live phase — the retired
    // tasks.status column carries no truth.
    await db
      .update(taskDispatches)
      .set({ phase: 'cancel_requested' })
      .where(eq(taskDispatches.id, binding!.dispatchId));
    chunk.release();

    const second = await iterator.next();
    if (second.done) throw new Error('stream ended without error event');
    expect(second.value.type).toBe('error');
    if (second.value.type !== 'error') return;
    expect(second.value.error.code).toBe('revoked');
  });

  it('early iterator exit aborts the in-flight provider request', async () => {
    await seed();
    const held = gate();
    inferPlan = async (res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write(sseDelta('a'));
      await held.promise; // never released — the abort must unwind this fetch
    };
    const result = await createEmbeddedInferenceBridge({ binding: binding!, database: db });
    if (!result.ok) throw new Error('bridge failed to compose');
    const built = result.value.buildInferenceRequest({
      request: sanitizedRequest(),
      session: sessionFor(binding!),
    });
    if (!built.ok) throw new Error('admission failed');

    const iterator = result.value.inferenceBroker.infer(built.value)[Symbol.asyncIterator]();
    const first = await iterator.next();
    expect(first.value).toEqual({ type: 'text', text: 'a' });

    await iterator.return?.();
    // The backend's AbortController unwinds the open HTTP request.
    await new Promise<void>((resolve) => setTimeout(resolve, 30));
    expect(inferResponsesAborted).toBe(1);
    held.release();
  });
});

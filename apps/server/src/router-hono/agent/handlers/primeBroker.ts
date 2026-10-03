import type {
  InferenceAuthority,
  InferenceEvent,
  InferenceRequest,
  ProviderBinding,
} from '@orvilo/agent-execution/controlPlane';
import {
  CONTROL_PLANE_VERSION,
  createInferenceBroker,
  toInferenceMessage,
} from '@orvilo/agent-execution/controlPlane';
import type {
  BrokerStreamEvent,
  SanitizedInferenceRequest,
} from '@orvilo/agent-execution/controlPlane/harnessProtocol';
import { isSanitizedInferenceRequest } from '@orvilo/agent-execution/controlPlane/harnessProtocol';
import { isNonEmptyString, isRecord } from '@orvilo/utils/object';
import debug from 'debug';
import { eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';

import { getServerDB } from '@/database/core/db-adaptor';
import { TaskExecutionControlModel } from '@/database/models/taskExecutionControl';
import { agentOperations } from '@/database/schemas/agentOperations';
import type { OrviloDatabase } from '@/database/type';
import type { CanonicalRunBinding } from '@/server/services/controlPlane/canonicalRun';
import { CanonicalRunAuthority } from '@/server/services/controlPlane/canonicalRun';
import {
  deriveDeviceRunBinding,
  deviceIdFromRuntimeOwner,
  deviceRuntimeOwnerId,
} from '@/server/services/controlPlane/deviceRunBinding';
import {
  isDeviceAdmissionLive,
  readRemoteRunAdmission,
} from '@/server/services/heterogeneousAgent/runAdmission';
import { SqlTrustedProviderBackend } from '@/server/services/providerBinding/controlPlane';
import {
  issueBindingExecution,
  resolveOrviloProviderBinding,
} from '@/server/services/providerBinding/execution';

import type { PrimeOperationClaims } from '../middlewares/primeOperationAuth';

const log = debug('orvilo-server:agent:prime-broker');

/** Lease window the broker surface re-arms on every authorized call —
 * bounded (TaskExecutionControlModel caps at 300s) so a device that stops
 * calling in loses its inference authority on schedule instead of running
 * uncontrolled. The device-side lease (descriptor `lease.ttlMs`) bounds
 * side-effects the other direction. */
const DEVICE_BROKER_LEASE_MS = 300_000;

/** In-flight infer streams keyed `operationId:requestId` — `/cancel` aborts. */
const inflight = new Map<string, AbortController>();

const encoder = new TextEncoder();

type ResolvedPrimeRun =
  | { kind: 'task'; binding: CanonicalRunBinding; db: OrviloDatabase }
  | {
      kind: 'conversation';
      db: OrviloDatabase;
      operation: {
        id: string;
        metadata: unknown;
        status: string;
        topicId: string | null;
        userId: string;
        workspaceId: string | null;
      };
    };

const readDevicePrimeSession = (metadata: unknown): string | undefined => {
  if (!isRecord(metadata) || !isRecord(metadata.devicePrime)) return undefined;
  return isNonEmptyString(metadata.devicePrime.sessionId)
    ? metadata.devicePrime.sessionId
    : undefined;
};

/**
 * Every broker endpoint derives the run's authority from the bound
 * credential's `operation_id` — the device supplies no binding fields — then
 * checks the credential's `device_id` against the run's owner.
 *
 * Task subjects resolve through the canonical binding (`runtimeOwnerId` =
 * `orvilo-device:<deviceId>` — a credential minted for device A never
 * authorizes as device B). Conversation subjects carry no task rows, so
 * their authority is the op's live device admission instead: the op must
 * still be running with an `agent_run_request` admission recorded against
 * the same device. That is a narrower but honest fence — bounded by the
 * op's liveness, the device identity, and the credential's own TTL.
 */
const resolvePrimeRun = async (
  claims: PrimeOperationClaims,
): Promise<ResolvedPrimeRun | Response> => {
  const db = await getServerDB();
  const binding = await deriveDeviceRunBinding(db, claims.operation_id);
  if (binding) {
    if (deviceIdFromRuntimeOwner(binding.runtimeOwnerId) !== claims.device_id) {
      log(
        'prime-broker: credential device %s does not match run owner %s (op=%s)',
        claims.device_id,
        binding.runtimeOwnerId,
        claims.operation_id,
      );
      return new Response(JSON.stringify({ error: 'Credential is bound to another device' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 403,
      });
    }
    return { binding, db, kind: 'task' };
  }

  const [operation] = await db
    .select()
    .from(agentOperations)
    .where(eq(agentOperations.id, claims.operation_id))
    .limit(1);
  const admission = operation ? readRemoteRunAdmission(operation.metadata) : undefined;
  const admitted =
    operation?.status === 'running' && isDeviceAdmissionLive(admission, claims.device_id);
  if (!operation || !admitted) {
    log('prime-broker: no device-admitted run for op=%s', claims.operation_id);
    return new Response(JSON.stringify({ error: 'Run is not device-admitted' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 403,
    });
  }
  return { db, kind: 'conversation', operation };
};

const readControl = async (db: OrviloDatabase, binding: CanonicalRunBinding) => {
  const registration = new TaskExecutionControlModel(db, binding.userId, binding.workspaceId);
  return registration.readControl(binding);
};

/** Tombstone binding for a denied snapshot — mirrors embeddedBroker's
 * `unavailableBinding`: never fabricate a substitute route. */
const unavailableBinding = (): ProviderBinding => ({
  bindingId: '',
  modelRoutes: [],
  ownerId: '',
  providerId: '',
  revision: -1,
  schemaVersion: CONTROL_PLANE_VERSION,
  secretReference: '',
  tenantId: '',
});

const streamEvent = (event: BrokerStreamEvent, requestId: string) =>
  encoder.encode(`${JSON.stringify({ event, requestId })}\n`);

// ---------------------------------------------------------------------------
// POST /api/agent/prime-broker/activate
// ---------------------------------------------------------------------------

const isActivateBody = (
  body: unknown,
): body is {
  artifact: { bytes: number; commit: string; license: string; sha256: string; version: string };
  runtime: { supervisorId: string; treeId: string };
  sessionId: string;
} => {
  if (!isRecord(body) || !isNonEmptyString(body.sessionId)) return false;
  const runtime = body.runtime;
  if (
    !isRecord(runtime) ||
    !isNonEmptyString(runtime.treeId) ||
    !isNonEmptyString(runtime.supervisorId)
  )
    return false;
  const artifact = body.artifact;
  return (
    isRecord(artifact) &&
    typeof artifact.sha256 === 'string' &&
    /^[a-f0-9]{64}$/.test(artifact.sha256) &&
    Number.isSafeInteger(artifact.bytes) &&
    (artifact.bytes as number) > 0 &&
    isNonEmptyString(artifact.version) &&
    isNonEmptyString(artifact.commit) &&
    isNonEmptyString(artifact.license)
  );
};

/**
 * The device host's launch proof: after `harness.init` acks, it reports the
 * activated session + device-side tree/supervisor identity + the locally
 * verified artifact digest. This is the contract's "device reports
 * locally-verified Prime version + artifact digest + re-verify at launch" —
 * the server records exactly what launched, and `infer` afterwards requires
 * the registered session. Identity mismatch fields are checked by
 * `activate`'s owns/fence guards — a foreign registration cannot be claimed.
 */
export const primeBrokerActivate = async (c: Context): Promise<Response> => {
  const claims = c.get('primeOperation');
  const body: unknown = await c.req.json().catch(() => null);
  if (!isActivateBody(body)) return c.json({ error: 'Invalid activation body' }, 400);

  const resolved = await resolvePrimeRun(claims);
  if (resolved instanceof Response) return resolved;
  const { db } = resolved;

  // Task subjects activate the canonical registration; conversation subjects
  // have no task rows — their launch proof is the evidence write below
  // (which `infer` then pins the session against).
  if (resolved.kind === 'task') {
    const registration = new TaskExecutionControlModel(
      db,
      resolved.binding.userId,
      resolved.binding.workspaceId,
    );
    try {
      await registration.activate(resolved.binding, {
        sessionId: body.sessionId,
        supervisorId: body.runtime.supervisorId,
        treeId: body.runtime.treeId,
      });
    } catch (error) {
      log(
        'prime-broker: activation refused for op=%s: %O',
        claims.operation_id,
        error instanceof Error ? error.message : error,
      );
      return c.json({ error: 'Runtime activation refused' }, 409);
    }
  }

  // Record the verified artifact the device actually launched with — the
  // acceptance matrix reads this back (identity + digest + session).
  try {
    await db
      .update(agentOperations)
      .set({
        metadata: sql`coalesce(${agentOperations.metadata}, '{}'::jsonb) || jsonb_build_object('devicePrime', ${JSON.stringify(
          {
            artifact: body.artifact,
            deviceId: claims.device_id,
            sessionId: body.sessionId,
            supervisorId: body.runtime.supervisorId,
            treeId: body.runtime.treeId,
          },
        )}::jsonb)`,
      })
      .where(eq(agentOperations.id, claims.operation_id));
  } catch (error) {
    // The registration already activated — the evidence write is audit, not
    // a launch gate. Log loudly instead of failing the run.
    log('prime-broker: devicePrime evidence write failed op=%s: %O', claims.operation_id, error);
  }

  return c.json({ ok: true });
};

// ---------------------------------------------------------------------------
// POST /api/agent/prime-broker/infer
// ---------------------------------------------------------------------------

const isInferBody = (
  body: unknown,
): body is { request: SanitizedInferenceRequest; sessionId: string } =>
  isRecord(body) && isNonEmptyString(body.sessionId) && isSanitizedInferenceRequest(body.request);

const toBrokerEvent = (event: InferenceEvent): BrokerStreamEvent => {
  switch (event.type) {
    case 'text': {
      return { text: event.text, type: 'text' };
    }
    case 'thinking': {
      return { text: event.text, type: 'thinking_delta' };
    }
    case 'toolcall_start': {
      return {
        index: event.index,
        name: event.name,
        toolCallId: event.toolCallId,
        type: 'toolcall_start',
      };
    }
    case 'toolcall_delta': {
      return {
        argumentsDelta: event.argumentsDelta,
        index: event.index,
        toolCallId: event.toolCallId,
        type: 'toolcall_delta',
      };
    }
    case 'toolcall_end': {
      return {
        index: event.index,
        toolCall: event.toolCall,
        type: 'toolcall_end',
      };
    }
    case 'usage': {
      return {
        inputTokens: event.inputTokens,
        outputTokens: event.outputTokens,
        type: 'usage',
      };
    }
    case 'error': {
      return { code: event.error.code, message: event.error.message, type: 'error' };
    }
  }
};

/**
 * The remote half of the embedded broker bridge: the device runner's
 * `broker.infer` reverse request lands here (via the device's broker bridge),
 * re-runs the canonical authority chain against live control rows, and
 * streams `BrokerStreamEvent`s back as NDJSON. `fence`/`bindingRevision` are
 * server-derived under the canonical row locks — never request payload —
 * and the credential's `model_route` must equal both the request route and
 * the issued binding's route.
 */
export const primeBrokerInfer = async (c: Context): Promise<Response> => {
  const claims = c.get('primeOperation');
  const body: unknown = await c.req.json().catch(() => null);
  if (!isInferBody(body)) return c.json({ error: 'Invalid infer body' }, 400);
  const { request, sessionId } = body;

  // The credential's route pin is part of the binding: a run that drifted to
  // a different model route than admission minted is denied, not resolved.
  if (request.modelRoute !== claims.model_route) {
    return c.json({ error: 'Model route outside the issued credential' }, 403);
  }

  const resolved = await resolvePrimeRun(claims);
  if (resolved instanceof Response) return resolved;
  const { db } = resolved;

  const userId = resolved.kind === 'task' ? resolved.binding.userId : resolved.operation.userId;
  const tenantId =
    resolved.kind === 'task' ? resolved.binding.workspaceId : resolved.operation.workspaceId;
  if (!tenantId) return c.json({ error: 'Run scope is not workspace-bound' }, 403);

  let inferenceAuthority: InferenceAuthority;

  if (resolved.kind === 'task') {
    const { binding } = resolved;
    const snapshot = await readControl(db, binding).catch(() => null);
    const control = snapshot?.control ?? null;
    if (!control || control.state !== 'running' || control.sessionId !== sessionId) {
      return c.json({ error: 'No activated session for this run' }, 409);
    }

    const row = await resolveOrviloProviderBinding(db, userId, 'sandbox', {
      model: claims.model_route,
    });
    if (!row) return c.json({ error: 'Provider binding unavailable' }, 403);
    const claim = {
      bindingId: row.id,
      bindingRevision: row.revision,
      ownerId: userId,
      tenantId,
    };
    const backend = new SqlTrustedProviderBackend(db);
    const authority = new CanonicalRunAuthority(db);
    const issued = await issueBindingExecution(db, claim);
    if (!issued) return c.json({ error: 'Provider binding is not issuable' }, 403);
    const capability = (await backend.capabilities(issued.binding)).find(
      (item) => item.modelRoute === claims.model_route,
    );
    if (!capability || capability.text !== true)
      return c.json({ error: 'Provider capability unavailable' }, 403);

    inferenceAuthority = {
      resolve: async (req) => {
        const result = await authority.withRun(binding, async (snapshot, tx) => {
          const issued = await issueBindingExecution(tx, claim);
          return { issued, snapshot };
        });
        if (!result.ok) {
          return {
            binding: unavailableBinding(),
            bindingOwnerId: '',
            capability,
            fence: req.fence,
            grantExpiresAt: 0,
            grantRevoked: true,
            leaseExpiresAt: 0,
          };
        }
        const { issued, snapshot } = result.value;
        return {
          binding: issued?.binding ?? unavailableBinding(),
          bindingOwnerId: issued?.binding.ownerId ?? '',
          capability,
          fence: snapshot.fence,
          grantExpiresAt: snapshot.grantExpiresAt,
          grantRevoked: false,
          leaseExpiresAt: snapshot.leaseExpiresAt,
        };
      },
    };

    // Admission check once up front so a denied run fails fast (409), then the
    // broker itself re-resolves per streamed event under the same chain.
    const first = await authority.withRun(binding, async (snapshot) => snapshot);
    if (!first.ok || first.value.registrationState !== 'running') {
      return c.json({ error: 'Run admission is not live' }, 409);
    }
    const requestFence = first.value.fence;

    // Every authorized infer re-arms the bounded lease — a device that stops
    // calling in loses authority on schedule. Outside the row locks; a renew
    // race against concurrent fencing loses honestly either way.
    await new TaskExecutionControlModel(db, binding.userId, binding.workspaceId)
      .renew(binding, DEVICE_BROKER_LEASE_MS)
      .catch(() => null);

    const inferenceRequest: InferenceRequest = {
      bindingRevision: issued.binding.revision,
      fence: requestFence,
      maxOutputTokens: request.maxOutputTokens,
      messages: request.messages.map(toInferenceMessage),
      modelRoute: claims.model_route,
      providerOptions: request.providerOptions,
      requestId: request.requestId,
      schemaVersion: CONTROL_PLANE_VERSION,
      serviceTier: request.serviceTier,
      thinkingLevel: request.thinkingLevel,
      tools: request.tools,
    };
    return streamInfer(c, claims, inferenceAuthority, backend, inferenceRequest);
  }

  // Conversation subject: no canonical task rows exist, so the authority is
  // the operation's live device admission. `activate` recorded the launch
  // proof; the session must match it. The synthesized fence keys honestly on
  // the operation (the subject carries no taskId — nothing is invented from
  // a foreign key) and the credential's own TTL bounds grant + lease.
  const operation = resolved.operation;
  if (readDevicePrimeSession(operation.metadata) !== sessionId) {
    return c.json({ error: 'No activated session for this run' }, 409);
  }

  const row = await resolveOrviloProviderBinding(db, userId, 'sandbox', {
    model: claims.model_route,
  });
  if (!row) return c.json({ error: 'Provider binding unavailable' }, 403);
  const claim = {
    bindingId: row.id,
    bindingRevision: row.revision,
    ownerId: userId,
    tenantId,
  };
  const backend = new SqlTrustedProviderBackend(db);
  const issued = await issueBindingExecution(db, claim);
  if (!issued) return c.json({ error: 'Provider binding is not issuable' }, 403);
  const capability = (await backend.capabilities(issued.binding)).find(
    (item) => item.modelRoute === claims.model_route,
  );
  if (!capability || capability.text !== true)
    return c.json({ error: 'Provider capability unavailable' }, 403);

  const conversationFence: InferenceRequest['fence'] = {
    epoch: 0,
    grantId: claims.jti,
    leaseId: claims.jti,
    ownerId: deviceRuntimeOwnerId(claims.device_id),
    policyRevision: 0,
    principalId: claims.sub,
    stateRevision: 0,
    taskId: claims.operation_id,
    tenantId,
  };
  inferenceAuthority = {
    // Re-read the op on every broker recheck: a settled/cancelled operation
    // or a rewritten admission kills the grant mid-stream.
    resolve: async () => {
      const [current] = await db
        .select()
        .from(agentOperations)
        .where(eq(agentOperations.id, claims.operation_id))
        .limit(1);
      const admission = current ? readRemoteRunAdmission(current.metadata) : undefined;
      const live =
        current?.status === 'running' &&
        isDeviceAdmissionLive(admission, claims.device_id) &&
        readDevicePrimeSession(current.metadata) === sessionId;
      return {
        binding: issued.binding,
        bindingOwnerId: issued.binding.ownerId,
        capability,
        fence: conversationFence,
        grantExpiresAt: claims.exp * 1000,
        grantRevoked: !live,
        leaseExpiresAt: claims.exp * 1000,
      };
    },
  };
  const conversationRequest: InferenceRequest = {
    bindingRevision: issued.binding.revision,
    fence: conversationFence,
    maxOutputTokens: request.maxOutputTokens,
    messages: request.messages.map(toInferenceMessage),
    modelRoute: claims.model_route,
    providerOptions: request.providerOptions,
    requestId: request.requestId,
    schemaVersion: CONTROL_PLANE_VERSION,
    serviceTier: request.serviceTier,
    thinkingLevel: request.thinkingLevel,
    tools: request.tools,
  };
  return streamInfer(c, claims, inferenceAuthority, backend, conversationRequest);
};

/** Shared NDJSON stream tail for both authority paths. */
const streamInfer = (
  c: Context,
  claims: PrimeOperationClaims,
  inferenceAuthority: InferenceAuthority,
  backend: SqlTrustedProviderBackend,
  inferenceRequest: InferenceRequest,
): Response => {
  const request = inferenceRequest;

  const key = `${claims.operation_id}:${request.requestId}`;
  const controller = new AbortController();
  inflight.set(key, controller);
  const onAbort = () => controller.abort();
  c.req.raw.signal.addEventListener('abort', onAbort, { once: true });

  const broker = createInferenceBroker({ authority: inferenceAuthority, backend });
  const stream = new ReadableStream<Uint8Array>({
    start: async (out) => {
      try {
        for await (const event of broker.infer(inferenceRequest, { signal: controller.signal })) {
          out.enqueue(streamEvent(toBrokerEvent(event), request.requestId));
          if (event.type === 'error') break;
        }
        out.enqueue(streamEvent({ type: 'end' }, request.requestId));
      } catch (error) {
        log('prime-broker: infer stream failed op=%s: %O', claims.operation_id, error);
        out.enqueue(
          streamEvent(
            { code: 'runtime_failed', message: 'Broker stream failed', type: 'error' },
            request.requestId,
          ),
        );
      } finally {
        inflight.delete(key);
        c.req.raw.signal.removeEventListener('abort', onAbort);
        out.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/x-ndjson; charset=utf-8',
    },
    status: 200,
  });
};

// ---------------------------------------------------------------------------
// POST /api/agent/prime-broker/cancel
// ---------------------------------------------------------------------------

/**
 * `broker.cancel` — aborts the in-flight infer stream for (operation,
 * requestId). Idempotent: cancelling an already-finished request is a no-op.
 */
export const primeBrokerCancel = async (c: Context): Promise<Response> => {
  const claims = c.get('primeOperation');
  const body: unknown = await c.req.json().catch(() => null);
  if (!isRecord(body) || !isNonEmptyString(body.requestId))
    return c.json({ error: 'requestId is required' }, 400);

  inflight.get(`${claims.operation_id}:${body.requestId}`)?.abort();
  return c.json({ ok: true });
};

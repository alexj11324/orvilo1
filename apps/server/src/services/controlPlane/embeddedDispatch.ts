/**
 * Phase 5a — dispatch routing for the Prime embedded harness.
 *
 * The seam sits inside `dispatchHeteroAgent`'s sandbox branch: when a run is
 * (a) our own agent (`heteroType === 'orvilo'` — the discriminator
 * `resolveExecutionBinding` synthesizes; ACP/hetero kinds never match), (b)
 * carrying canonical task context (a task dispatch id + fence + generation on
 * `appContext`, present only on real task dispatches — chat runs can't), and
 * (c) the dispatch composes `CanonicalCoreRuntimeHost` with `embedded`
 * filled and drives the run in-process. `orvilo` is Orvilo's own engine —
 * it always runs the embedded Prime harness, like `codex` always runs the
 * codex CLI; there is no flag gating which engine an own-agent type uses.
 *
 * The host's prompt stream is translated back into the shared
 * `AgentStreamEvent` → `heteroIngest` / `heteroFinish` producer path, so the
 * message surface, lifecycle hooks, and operation row look identical to a
 * cloud-sandbox run. Everything an ACP/hetero run does is untouched.
 *
 * v1 scope (documented in `docs/development/prime-embedded-host-integration.md`
 * §6 and this phase's PR): text-only — no tools/file commitments, no image
 * inputs, no workspace materialization, single turn.
 */
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type {
  ControlError,
  ControlResult,
  TrustedProviderBackend,
} from '@orvilo/agent-execution/controlPlane';
import type {
  DockerSupervisorOptions,
  EmbeddedArtifactManifest,
} from '@orvilo/agent-execution/controlPlane/server';
import {
  embeddedArtifactVerifier,
  isEmbeddedArtifactManifest,
} from '@orvilo/agent-execution/controlPlane/server';
import type { AgentStreamEvent } from '@orvilo/agent-gateway-client';
import type { LocalHeterogeneousAgentType } from '@orvilo/heterogeneous-agents';
import { toStreamEvent } from '@orvilo/heterogeneous-agents/spawn';
import type { OrviloEngineKind } from '@orvilo/types';
import debug from 'debug';
import { and, eq } from 'drizzle-orm';

import { TaskDispatchModel } from '@/database/models/taskDispatch';
import { tasks, taskTopics } from '@/database/schemas';
import type { OrviloDatabase } from '@/database/type';
import { AgentDelegationService } from '@/server/services/agentDelegation/executionGrants';
import { HeterogeneousAgentService } from '@/server/services/heterogeneousAgent';
import { SqlTrustedProviderBackend } from '@/server/services/providerBinding/controlPlane';
import {
  issueBindingExecution,
  resolveOrviloProviderBinding,
} from '@/server/services/providerBinding/execution';

import type { CanonicalRunBinding } from './canonicalRun';
import type { HostSupervisorPort } from './coreRuntimeHost';
import { CanonicalCoreRuntimeHost } from './coreRuntimeHost';

const log = debug('orvilo-server:embedded-dispatch');

/** Bounded grant lifetime for a self-minted run grant (delegated runs reuse
 * the grant the caller already bound on the run row). Matches the run window
 * the cloud sandbox gets under its operation JWT. */
const EMBEDDED_RUN_GRANT_TTL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_SUPERVISOR_ID = 'orvilo-embedded-supervisor';
const DEFAULT_EXECUTABLE = '/usr/local/bin/node';
const RUNTIME_OWNER_ID = 'orvilo-embedded-host';

const failure = (code: ControlError['code'], message: string): ControlResult<never> => ({
  error: { code, message, retryable: false },
  ok: false,
});

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

// ---------------------------------------------------------------------------
// Routing predicate
// ---------------------------------------------------------------------------

/**
 * Canonical run context extracted off `ExecRunContext.appContext` — the
 * typed result of `resolveEmbeddedDispatchRoute`. Present only when the run
 * is a real task dispatch (`taskRunner` writes these fields); chat runs and
 * device-planned runs never reach this predicate's sandbox branch.
 */
export interface EmbeddedDispatchContext {
  dispatchFence: number;
  dispatchId: string;
  executionGeneration: number;
  taskId: string;
}

export interface EmbeddedDispatchRouteInput {
  /** `ExecRunContext.appContext` — task dispatches carry dispatch context. */
  appContext?: {
    dispatchFence?: unknown;
    dispatchId?: unknown;
    executionGeneration?: unknown;
  } | null;
  /** `turn.heteroType` — `'orvilo'` exactly for our own agent. */
  heteroType: string;
  /** The task a task-run dispatch serves (`operationTaskId`); chat has none. */
  operationTaskId?: string;
}

/**
 * The embedded route admits every own-agent task dispatch on the sandbox
 * plan and returns its canonical context fully typed so the seam needs no
 * narrowing. Everything else — ACP/hetero kinds, chat runs, device-planned
 * runs — gets `null` and keeps the existing dispatch path byte-identical.
 */
export const resolveEmbeddedDispatchRoute = async (
  deps: { userId: string },
  input: EmbeddedDispatchRouteInput,
): Promise<EmbeddedDispatchContext | null> => {
  if (input.heteroType !== 'orvilo' || !input.operationTaskId) return null;
  const { dispatchFence, dispatchId, executionGeneration } = input.appContext ?? {};
  if (
    typeof dispatchId !== 'string' ||
    typeof dispatchFence !== 'number' ||
    typeof executionGeneration !== 'number'
  )
    return null;
  return {
    dispatchFence,
    dispatchId,
    executionGeneration,
    taskId: input.operationTaskId,
  };
};

// ---------------------------------------------------------------------------
// Host composition (pre-launch)
// ---------------------------------------------------------------------------

export interface EmbeddedDispatchEnvironment {
  /** Runner bundle path; defaults to the built `packages/prime-harness` artifact. */
  artifact?: string;
  backend?: TrustedProviderBackend;
  executable?: string;
  /** Digest-pinned runner image; default `ORVILO_PRIME_EMBEDDED_IMAGE_ID`. */
  imageId?: string;
  /** Broker dirs root; defaults to a fresh `orvilo-embedded-*` tmpdir. */
  runDirectory?: string;
  supervisor?: (options: DockerSupervisorOptions) => HostSupervisorPort;
  supervisorId?: string;
}

export interface OpenEmbeddedHostInput extends EmbeddedDispatchContext {
  engine?: OrviloEngineKind | string | null;
  environment?: EmbeddedDispatchEnvironment;
  /** Task's requested model/provider — narrows which binding may issue. */
  model?: string;
  operationId: string;
  provider?: string;
  topicId: string;
}

export interface EmbeddedDispatchHost {
  binding: CanonicalRunBinding;
  directories: { control: string; output: string; root: string; workspace: string };
  host: CanonicalCoreRuntimeHost;
  /** Model route pinned by the issued binding — stamped on `stream_start`. */
  initModelId: string;
}

/** The built runner bundle, resolved lazily and repo-relative from this file.
 * A plain dirname join, never `new URL(literal, import.meta.url)` — bundlers
 * trace that form into the module graph and the unbuilt `dist/` breaks the
 * web-app build; only the flag-on dispatch path ever evaluates this. */
const defaultRunnerArtifact = () =>
  path.join(
    import.meta.dirname,
    '..',
    '..',
    '..',
    '..',
    '..',
    'packages',
    'prime-harness',
    'dist',
    'runner.mjs',
  );

/**
 * Everything before launch: read the canonical rows the binding pins, mint or
 * reuse the run grant/epoch, resolve + issue the provider binding against the
 * task's requested provider/model, then open the host (compose + register +
 * embedded bridge) so an unavailable binding fails here — never at launch.
 */
export const openEmbeddedDispatchHost = async (
  deps: { database: OrviloDatabase; userId: string },
  input: OpenEmbeddedHostInput,
): Promise<ControlResult<EmbeddedDispatchHost>> => {
  const { database: db, userId } = deps;

  // The task row is the tenant source of truth: the canonical workspace is
  // the task's own workspace, not the caller's ambient scope.
  const [task] = await db.select().from(tasks).where(eq(tasks.id, input.taskId)).limit(1);
  if (
    !task ||
    task.domainRevision === null ||
    task.workspaceId === null ||
    task.isDeleted ||
    task.deletedAt
  ) {
    return failure('stale_fence', 'Task contract is not current');
  }
  const workspaceId = task.workspaceId;
  const dispatch = await new TaskDispatchModel(db, workspaceId).findById(input.dispatchId);
  if (
    !dispatch ||
    dispatch.taskId !== input.taskId ||
    dispatch.operationId !== input.operationId ||
    dispatch.fence !== input.dispatchFence ||
    dispatch.generation !== input.executionGeneration ||
    !dispatch.agentId ||
    dispatch.policyRevision === null
  ) {
    return failure('stale_fence', 'Dispatch contract is not current');
  }

  // Run grant/epoch: a delegated run's claim already bound both on the run
  // row (runTask claims the epoch inside beforeOperationStart); a manual run
  // mints a bounded self-grant and claims here. `register` has not run yet,
  // so `claimExecutionEpoch`'s no-runtime guard still passes.
  const [runRow] = await db
    .select({
      executionEpoch: taskTopics.executionEpoch,
      executionGrantId: taskTopics.executionGrantId,
    })
    .from(taskTopics)
    .where(and(eq(taskTopics.taskId, input.taskId), eq(taskTopics.topicId, input.topicId)))
    .limit(1);
  let grantId = runRow?.executionGrantId ?? undefined;
  let executionEpoch = runRow?.executionEpoch ?? undefined;
  if (!grantId || !executionEpoch) {
    try {
      const delegation = new AgentDelegationService(db, userId, workspaceId);
      const grant = await delegation.createGrant({
        agentId: dispatch.agentId,
        expiresAt: new Date(Date.now() + EMBEDDED_RUN_GRANT_TTL_MS),
        task: { id: task.id, projectId: task.projectId, workspaceId: task.workspaceId },
      });
      executionEpoch = await delegation.claimExecutionEpoch({
        grantId: grant.id,
        taskId: input.taskId,
        topicId: input.topicId,
      });
      grantId = grant.id;
    } catch (error) {
      return failure(
        'policy_denied',
        `Embedded run delegation is not mintable: ${errorMessage(error)}`,
      );
    }
  }

  const binding: CanonicalRunBinding = {
    dispatchFence: input.dispatchFence,
    dispatchId: input.dispatchId,
    executionEpoch,
    generation: input.executionGeneration,
    grantId,
    operationId: input.operationId,
    policyRevision: dispatch.policyRevision,
    runtimeLeaseId: randomUUID(),
    runtimeOwnerId: RUNTIME_OWNER_ID,
    runtimeRegistrationId: randomUUID(),
    stateRevision: task.domainRevision,
    taskId: input.taskId,
    topicId: input.topicId,
    userId,
    workspaceId,
  };

  const environment = input.environment ?? {};
  const artifact = environment.artifact ?? defaultRunnerArtifact();
  const manifestPath = path.join(path.dirname(artifact), 'runner.manifest.json');
  let manifest: EmbeddedArtifactManifest;
  try {
    const parsed: unknown = JSON.parse(await readFile(manifestPath, 'utf8'));
    if (!isEmbeddedArtifactManifest(parsed))
      return failure('policy_denied', 'Embedded runner manifest is invalid');
    manifest = parsed;
  } catch (error) {
    return failure(
      'policy_denied',
      `Embedded runner manifest is not readable: ${errorMessage(error)}`,
    );
  }
  const imageId = environment.imageId ?? process.env.ORVILO_PRIME_EMBEDDED_IMAGE_ID;
  if (!imageId) {
    return failure(
      'policy_denied',
      'Embedded supervisor image is not configured (ORVILO_PRIME_EMBEDDED_IMAGE_ID)',
    );
  }

  // Resolve + issue BEFORE the host exists so an unavailable binding fails
  // with the real reason at prepare time; the issued route stamps
  // `initModel`. The bridge still re-resolves inside `open()` and `start()`
  // re-verifies the claim under the canonical row locks.
  const backend = environment.backend ?? new SqlTrustedProviderBackend(db);
  let host: CanonicalCoreRuntimeHost;
  let initModelId: string;
  const root =
    environment.runDirectory ??
    (await realpath(await mkdtemp(path.join(tmpdir(), 'orvilo-embedded-'))));
  const directories = {
    control: path.join(root, 'control'),
    output: path.join(root, 'output'),
    root,
    workspace: path.join(root, 'workspace'),
  };
  await mkdir(directories.workspace, { mode: 0o700, recursive: true });
  try {
    const resolved = await resolveOrviloProviderBinding(db, userId, input.engine, 'sandbox', {
      model: input.model,
      provider: input.provider,
    });
    if (!resolved) return failure('unauthorized', 'No provider binding resolves in this run scope');
    const claim = {
      bindingId: resolved.id,
      bindingRevision: resolved.revision,
      ownerId: userId,
      tenantId: workspaceId,
    };
    const issued = await issueBindingExecution(db, claim);
    if (!issued)
      return failure('unauthorized', 'Provider binding is not issuable in this run scope');
    const capability = (await backend.capabilities(issued.binding)).find(
      (item) => item.modelRoute === issued.binding.modelRoutes[0],
    );
    if (!capability || capability.text !== true)
      return failure(
        'unsupported_capability',
        'Provider capability is not issuable in this run scope',
      );
    initModelId = capability.modelRoute;

    host = await CanonicalCoreRuntimeHost.open({
      binding,
      controlDirectory: directories.control,
      database: db,
      docker: {
        executable: environment.executable ?? DEFAULT_EXECUTABLE,
        imageId,
        supervisorId: environment.supervisorId ?? DEFAULT_SUPERVISOR_ID,
        workspace: directories.workspace,
      },
      embedded: {
        artifact,
        backend,
        engine: input.engine,
        resolveBinding: async () => resolved,
        target: 'sandbox',
        verifyArtifact: embeddedArtifactVerifier(manifest),
      },
      fileCommitments: [],
      outputDirectory: directories.output,
      supervisor: environment.supervisor,
    });
  } catch (error) {
    return failure('policy_denied', `Embedded host composition failed: ${errorMessage(error)}`);
  }

  return { ok: true, value: { binding, directories, host, initModelId } };
};

// ---------------------------------------------------------------------------
// Run drive (post-launch): host prompt stream → hetero producer surface
// ---------------------------------------------------------------------------

export interface EmbeddedRunDriverInput {
  agentType: LocalHeterogeneousAgentType;
  assistantMessageId: string;
  operationId: string;
  /** Single composed prompt (cloud system context + task instruction). */
  prompt: string;
  topicId: string;
}

const streamEvent = (
  operationId: string,
  type:
    | 'error'
    | 'stream_chunk'
    | 'stream_end'
    | 'stream_start'
    | 'step_complete'
    | 'visible_output_end',
  data: Record<string, unknown>,
): AgentStreamEvent =>
  toStreamEvent({ data, stepIndex: 0, timestamp: Date.now(), type }, operationId);

/**
 * Drive a prepared embedded host to completion, producing through the shared
 * `heteroIngest`/`heteroFinish` path so the run's message surface and
 * lifecycle hooks are identical to a cloud-sandbox turn.
 *
 * Ordering is fixed by the canonical settle fence: `heteroFinish` (and the
 * task settle it fires) must precede `host.shutdown()` — once the dispatch
 * settles or is cancel-fenced, `registration.stop` can no longer match the
 * binding's fence, so shutdown's drain reports `not_quiescent`; the run is
 * already durably finished at that point and the miss is logged, not thrown.
 */
export const driveEmbeddedCanonicalRun = async (
  deps: { database: OrviloDatabase; userId: string; workspaceId?: string },
  prepared: EmbeddedDispatchHost,
  run: EmbeddedRunDriverInput,
): Promise<void> => {
  const { database: db, userId, workspaceId } = deps;
  const { operationId, topicId } = run;
  const heteroService = new HeterogeneousAgentService(db, userId, { workspaceId });
  const ingest = async (events: AgentStreamEvent[]) => {
    try {
      await heteroService.heteroIngest({
        agentType: run.agentType,
        assistantMessageId: run.assistantMessageId,
        events,
        operationId,
        topicId,
      });
    } catch (error) {
      log('embedded dispatch: heteroIngest failed op=%s (non-fatal): %O', operationId, error);
    }
  };

  let result: 'cancelled' | 'error' | 'success' = 'error';
  let finishError: { message: string; type: string } | undefined;
  try {
    const started = await prepared.host.start();
    if (!started.ok) {
      finishError = { message: started.error.message, type: 'AgentRuntimeError' };
    } else {
      result = 'success';
      // No `sessionId`: the harness session id is not a CLI `--resume` token
      // and must never land on `topic.metadata.heteroSessionId`.
      await ingest([
        streamEvent(operationId, 'stream_start', {
          model: prepared.initModelId,
          provider: 'orvilo',
        }),
      ]);
      for await (const event of prepared.host.prompt(run.prompt)) {
        if (event.type === 'text') {
          await ingest([
            streamEvent(operationId, 'stream_chunk', { chunkType: 'text', content: event.text }),
          ]);
        } else if (event.type === 'usage') {
          const total = event.totalTokens ?? event.inputTokens + event.outputTokens;
          await ingest([
            streamEvent(operationId, 'step_complete', {
              model: prepared.initModelId,
              phase: 'turn_metadata',
              provider: 'orvilo',
              usage: {
                cost: event.cost?.total,
                inputCacheMissTokens: event.inputTokens,
                inputWriteCacheTokens: 0,
                totalInputTokens: event.inputTokens,
                totalOutputTokens: event.outputTokens,
                totalTokens: total,
              },
            }),
          ]);
        } else if (event.type === 'turn-ended') {
          if (event.reason === 'cancelled') result = 'cancelled';
        } else {
          // 'error'
          finishError = { message: event.error.message, type: 'AgentRuntimeError' };
          result = 'error';
        }
      }
      if (result === 'error' && finishError)
        await ingest([streamEvent(operationId, 'error', { message: finishError.message })]);
      if (result !== 'error')
        await ingest([
          streamEvent(operationId, 'stream_end', {}),
          streamEvent(operationId, 'visible_output_end', {}),
        ]);
    }
  } catch (error) {
    console.error('embedded dispatch: run loop failed op=%s: %O', operationId, error);
    result = 'error';
    finishError ??= { message: errorMessage(error), type: 'AgentRuntimeError' };
  }

  try {
    await heteroService.heteroFinish({
      agentType: run.agentType,
      assistantMessageId: run.assistantMessageId,
      error: finishError,
      operationId,
      result,
      topicId,
    });
  } catch (error) {
    console.error('embedded dispatch: heteroFinish failed op=%s: %O', operationId, error);
  }
  try {
    await prepared.host.shutdown();
  } catch (error) {
    // Expected once the dispatch settle (or a user cancel) bumped the fence:
    // `registration.stop` can no longer match, so the drain reports
    // `not_quiescent`. The run is already durably finished.
    log('embedded dispatch: shutdown drained without quiescence op=%s: %O', operationId, error);
  }
};

/**
 * Phase 5a — dispatch routing for the Prime embedded harness.
 *
 * The seam sits inside `dispatchHeteroAgent`'s non-device (sandbox) branch:
 * when a run is (a) our own agent (`heteroType === 'orvilo'` — the
 * discriminator `resolveExecutionBinding` synthesizes; ACP/hetero kinds
 * never match), (b) carrying canonical task context (a task dispatch id +
 * fence + generation on `appContext`, present only on real task dispatches
 * — chat runs can't), and (c) the dispatch composes
 * `CanonicalCoreRuntimeHost` with `embedded` filled and drives the run
 * in-process. `orvilo`'s harness is fixed to Prime — like `codex` always
 * runs the codex CLI, there is no flag gating which engine an own-agent
 * type uses. While the device-side Prime adapter is being packaged a
 * TRANSITIONAL fence keeps device-resolved orvilo plans here too — every
 * orvilo plan (sandbox or device) reaches this fork until the adapter
 * ships and the fence flips (device-execution-contract.md
 * §transitional-fence).
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
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type {
  ControlError,
  ControlResult,
  TrustedProviderBackend,
} from '@orvilo/agent-execution/controlPlane';
import type { HarnessInitPolicy } from '@orvilo/agent-execution/controlPlane/harnessProtocol';
import {
  createPrimeStreamState,
  mapRuntimeEvent,
  subagentContext,
} from '@orvilo/agent-execution/controlPlane/primeStreamMapping';
import type {
  DockerSupervisorOptions,
  EmbeddedArtifactManifest,
} from '@orvilo/agent-execution/controlPlane/server';
import {
  embeddedArtifactVerifier,
  isEmbeddedArtifactManifest,
} from '@orvilo/agent-execution/controlPlane/server';
import type { AgentStreamEvent } from '@orvilo/agent-gateway-client';
import type { HeterogeneousAgentType } from '@orvilo/heterogeneous-agents';
import { toStreamEvent } from '@orvilo/heterogeneous-agents/spawn';
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

import type {
  CanonicalRunAuthorityPort,
  CanonicalRunBinding,
  CanonicalRunRegistrationPort,
} from './canonicalRun';
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
 * is a real task dispatch (`taskRunner` writes these fields); chat runs
 * have no task context, and external types never resolve an own-agent
 * route.
 */
export interface EmbeddedDispatchContext {
  dispatchFence: number;
  dispatchId: string;
  executionGeneration: number;
  subject: { dispatchId: string; kind: 'task'; taskId: string };
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
 * The embedded route admits every own-agent task dispatch reaching this
 * fork (sandbox plans, plus device plans held here by the transitional
 * fence) and returns its canonical context fully typed so the seam needs
 * no narrowing. Everything else — ACP/hetero kinds, chat runs — gets
 * `null` and keeps the existing dispatch path byte-identical.
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
    subject: { dispatchId, kind: 'task', taskId: input.operationTaskId },
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
  environment?: EmbeddedDispatchEnvironment;
  /** Task's requested model route — narrows which binding may issue. */
  model?: string;
  operationId: string;
  topicId: string;
}

export interface EmbeddedDispatchHost {
  binding: CanonicalRunBinding;
  directories: { control: string; output: string; root: string; workspace: string };
  host: CanonicalCoreRuntimeHost;
  /** Model route pinned by the issued binding — stamped on `stream_start`. */
  initModelId: string;
}

/** The built runner bundle, resolved lazily.
 *
 * `import.meta.dirname` is the honest base under real ESM (vitest, tsx, plain
 * node), but bundled server builds either leave it undefined or repoint it at
 * the output chunk directory — never `new URL(literal, import.meta.url)`,
 * which bundlers trace into the module graph and breaks the web-app build on
 * the unbuilt `dist/`. Resolution is therefore candidate-based: an explicit
 * `ORVILO_PRIME_EMBEDDED_ARTIFACT` first (deployments pin it like the image
 * id), then the source-relative join when it exists on disk, then the
 * checkout the server process runs from (`next start`/`next dev` cwd is the
 * repo root). The last fallback is still returned so a missing bundle fails
 * `policy_denied` on a meaningful path instead of a crashed resolution. */
export const defaultRunnerArtifact = (): string => {
  const fromEnv = process.env.ORVILO_PRIME_EMBEDDED_ARTIFACT;
  if (fromEnv) return fromEnv;
  const candidates = [
    typeof import.meta.dirname === 'string'
      ? path.join(
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
        )
      : undefined,
    path.resolve('packages', 'prime-harness', 'dist', 'runner.mjs'),
  ].filter((candidate): candidate is string => typeof candidate === 'string');
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
};

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
  const [task] = await db.select().from(tasks).where(eq(tasks.id, input.subject.taskId)).limit(1);
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
    dispatch.taskId !== input.subject.taskId ||
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
    .where(and(eq(taskTopics.taskId, input.subject.taskId), eq(taskTopics.topicId, input.topicId)))
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
        taskId: input.subject.taskId,
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
    subject: input.subject,
    topicId: input.topicId,
    userId,
    workspaceId,
  };

  return composeEmbeddedRunHost(deps, {
    binding,
    environment: input.environment,
    init: {
      // The task's own name is the top-level goal the session seeds
      // (upstream `initialGoal`); RLM depth stays pinned at the upstream
      // default rather than unlimited.
      ...(task.name ? { goal: { objective: task.name } } : {}),
      rlm: { maxDepth: 2 },
    },
    model: input.model,
  });
};

export interface ComposeEmbeddedHostInput {
  /** Canonical binding the run is admitted under (task or chat shaped). */
  binding: CanonicalRunBinding;
  environment?: EmbeddedDispatchEnvironment;
  /** Run-derived `harness.init` policy (goal/rlm/tool surface) — merged
   * under the binding-derived slice the bridge returns. */
  init?: HarnessInitPolicy;
  /** Task's requested model route — narrows which binding may issue. */
  model?: string;
  /** Chat runs substitute their own canonical contracts (canonicalChatRun.ts). */
  overrides?: {
    authority?: CanonicalRunAuthorityPort;
    registration?: CanonicalRunRegistrationPort;
    runAuthority?: CanonicalRunAuthorityPort;
  };
}

/**
 * Shared embedded-host composition for both admission shapes: read + verify
 * the pinned runner artifact, resolve + issue the provider binding inside the
 * run's tenant scope, then open `CanonicalCoreRuntimeHost` with the embedded
 * bridge. Task dispatches and chat runs reach this with their own binding +
 * canonical contracts; everything from here down is identical.
 */
export const composeEmbeddedRunHost = async (
  deps: { database: OrviloDatabase; userId: string },
  input: ComposeEmbeddedHostInput,
): Promise<ControlResult<EmbeddedDispatchHost>> => {
  const { database: db, userId } = deps;
  const { binding } = input;
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
    // Model-route narrowing only: the run's provider pin is the `orvilo`
    // type marker, not a binding provider id, so it must not filter rows.
    const resolved = await resolveOrviloProviderBinding(db, userId, 'sandbox', {
      model: input.model,
    });
    if (!resolved) return failure('unauthorized', 'No provider binding resolves in this run scope');
    const claim = {
      bindingId: resolved.id,
      bindingRevision: resolved.revision,
      ownerId: userId,
      tenantId: binding.workspaceId,
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
      authority: input.overrides?.authority,
      binding,
      controlDirectory: directories.control,
      database: db,
      docker: {
        executable: environment.executable ?? DEFAULT_EXECUTABLE,
        imageId,
        // The runner idles at ~200 MiB (17 MB bundle + agent bootstrap) and
        // allocates inference buffers per turn — the 256 MiB supervisor
        // default leaves bursts no headroom and the cgroup OOM-kill surfaces
        // as an intermittent "harness startup failed".
        memoryMiB: 768,
        supervisorId: environment.supervisorId ?? DEFAULT_SUPERVISOR_ID,
        workspace: directories.workspace,
      },
      embedded: {
        artifact,
        backend,
        initPolicy: input.init,
        resolveBinding: async () => resolved,
        runAuthority: input.overrides?.runAuthority,
        target: 'sandbox',
        verifyArtifact: embeddedArtifactVerifier(manifest),
      },
      fileCommitments: [],
      outputDirectory: directories.output,
      registration: input.overrides?.registration,
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
  /** Ingest label — the declared hetero type; `'orvilo'` for embedded runs. */
  agentType: HeterogeneousAgentType;
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
    | 'tool_start'
    | 'tool_result'
    | 'tool_end'
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
      const streamState = createPrimeStreamState();
      for await (const event of prepared.host.prompt(run.prompt)) {
        if (event.type === 'text') {
          const subagent = subagentContext(streamState, event.subagent);
          await ingest([
            streamEvent(operationId, 'stream_chunk', {
              chunkType: 'text',
              content: event.text,
              ...(subagent ? { subagent } : {}),
            }),
          ]);
        } else if (
          event.type === 'thinking' ||
          event.type === 'subagent_update' ||
          event.type.startsWith('tool_')
        ) {
          const emissions = mapRuntimeEvent(streamState, event);
          if (emissions.length > 0)
            await ingest(
              emissions.map((emission) => streamEvent(operationId, emission.type, emission.data)),
            );
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
        } else if (event.type === 'error') {
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

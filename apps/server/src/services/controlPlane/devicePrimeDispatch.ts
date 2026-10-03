/**
 * Dispatch-admission composition for a Prime run on a resolved Device.
 *
 * This is the device mirror of `openEmbeddedDispatchHost`'s prepare half: it
 * validates the canonical task/dispatch/grant rows, resolves + issues the
 * provider binding up front (so an unavailable binding fails at admission,
 * not mid-run on the device), registers the canonical run with the DEVICE as
 * runtime owner (`orvilo-device:<deviceId>` — a bounded 300s lease the
 * broker surface re-arms on each authorized call), reads the shipped
 * artifact manifest so the device verifies the exact digest+pin before
 * launch, and mints the bound `prime:infer` credential (operation + device +
 * model-route + TTL — never a raw provider key, per the device-execution
 * contract's cross-device credential rule).
 *
 * Conversation subjects (chat runs) carry no task context: they cannot
 * register canonically (the registration rows are task-shaped), so they skip
 * registration but still get the bound credential + descriptor — the broker
 * endpoint applies the conversation-scoped authority for those.
 */
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { ControlError, ControlResult } from '@orvilo/agent-execution/controlPlane';
import type { EmbeddedArtifactManifest } from '@orvilo/agent-execution/controlPlane/server';
import { isEmbeddedArtifactManifest } from '@orvilo/agent-execution/controlPlane/server';
import type { PrimeRunDescriptor } from '@orvilo/device-gateway-client';
import { and, eq } from 'drizzle-orm';

import { TaskDispatchModel } from '@/database/models/taskDispatch';
import { TaskExecutionControlModel } from '@/database/models/taskExecutionControl';
import { tasks, taskTopics } from '@/database/schemas';
import type { OrviloDatabase } from '@/database/type';
import { signHeteroOperationJWT } from '@/libs/trpc/utils/internalJwt';
import { AgentDelegationService } from '@/server/services/agentDelegation/executionGrants';
import { SqlTrustedProviderBackend } from '@/server/services/providerBinding/controlPlane';
import {
  issueBindingExecution,
  resolveOrviloProviderBinding,
} from '@/server/services/providerBinding/execution';

import type { CanonicalRunBinding } from './canonicalRun';
import { deviceRuntimeOwnerId } from './deviceRunBinding';
import type { EmbeddedDispatchContext } from './embeddedDispatch';

/** Mirrors the embedded grant window — same run length, different owner. */
const DEVICE_RUN_GRANT_TTL_MS = 6 * 60 * 60 * 1000;
/** Canonical registration lease; the broker endpoint renews per authorized call. */
const DEVICE_BROKER_LEASE_MS = 300_000;
/** Device-side bounded lease: no renewal signal from the control side (the
 * device's gateway heartbeat is the liveness proxy) for this long → the
 * device host stops new side-effects. Sized to ~3 missed heartbeats. */
export const DEVICE_SIDE_LEASE_TTL_MS = 90_000;

const failure = (code: ControlError['code'], message: string): ControlResult<never> => ({
  error: { code, message, retryable: false },
  ok: false,
});

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** Same artifact location as embeddedDispatch's `defaultRunnerArtifact` —
 * kept repo-relative lazily so bundlers never trace the unbuilt dist. */
const defaultRunnerManifest = () =>
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
    'runner.manifest.json',
  );

export interface ComposeDevicePrimeRunInput {
  deviceId: string;
  /** Task's requested model route — narrows which binding may issue. */
  model?: string;
  operationId: string;
  /** Canonical task context when the run serves a task dispatch; absent for
   * conversation subjects (chat). */
  task?: EmbeddedDispatchContext;
  topicId: string;
}

export interface DevicePrimeRunComposition {
  binding?: CanonicalRunBinding;
  descriptor: PrimeRunDescriptor;
}

/**
 * Compose everything the `agent_run_request` needs for a Prime device run.
 * Registering here — before the gateway call — keeps the canonical lease
 * truthful: a dispatch that never lands leaves a 'registering' row the
 * normal sweeps expire; it cannot mint broker authority without activation.
 */
export const composeDevicePrimeRun = async (
  deps: { database: OrviloDatabase; userId: string; workspaceId: string | undefined },
  input: ComposeDevicePrimeRunInput,
): Promise<ControlResult<DevicePrimeRunComposition>> => {
  const { database: db, userId, workspaceId } = deps;

  // The tenant binds the issued credential and the canonical registration —
  // a run with no workspace scope cannot mint either, so it fails closed
  // here rather than launching unscoped.
  if (!workspaceId) return failure('unauthorized', 'Run has no workspace scope to bind against');

  // Provider binding resolves + issues at admission — a run whose provider
  // is unavailable fails before the device is ever asked to launch.
  const resolved = await resolveOrviloProviderBinding(db, userId, 'sandbox', {
    model: input.model,
  });
  if (!resolved) return failure('unauthorized', 'No provider binding resolves in this run scope');
  const claim = {
    bindingId: resolved.id,
    bindingRevision: resolved.revision,
    ownerId: userId,
    tenantId: workspaceId,
  };
  const issued = await issueBindingExecution(db, claim);
  if (!issued) return failure('unauthorized', 'Provider binding is not issuable in this run scope');
  const capability = (
    await new SqlTrustedProviderBackend(db).capabilities(issued.binding).catch(() => [] as never)
  ).find((item) => item.modelRoute === issued.binding.modelRoutes[0]);
  if (!capability || capability.text !== true)
    return failure(
      'unsupported_capability',
      'Provider capability is not issuable in this run scope',
    );

  let manifest: EmbeddedArtifactManifest;
  try {
    const parsed: unknown = JSON.parse(await readFile(defaultRunnerManifest(), 'utf8'));
    if (!isEmbeddedArtifactManifest(parsed))
      return failure('policy_denied', 'Device runner manifest is invalid');
    manifest = parsed;
  } catch (error) {
    return failure(
      'policy_denied',
      `Device runner manifest is not readable: ${errorMessage(error)}`,
    );
  }

  let binding: CanonicalRunBinding | undefined;
  if (input.task) {
    // Same canonical rows as the embedded prepare: task contract current,
    // dispatch contract current, grant/epoch claimed, device-owned
    // registration written under the task's own workspace.
    const [task] = await db.select().from(tasks).where(eq(tasks.id, input.task.taskId)).limit(1);
    if (
      !task ||
      task.domainRevision === null ||
      task.workspaceId === null ||
      task.isDeleted ||
      task.deletedAt
    )
      return failure('stale_fence', 'Task contract is not current');
    const taskWorkspaceId = task.workspaceId;
    const dispatch = await new TaskDispatchModel(db, taskWorkspaceId).findById(
      input.task.dispatchId,
    );
    if (
      !dispatch ||
      dispatch.taskId !== input.task.taskId ||
      dispatch.operationId !== input.operationId ||
      dispatch.fence !== input.task.dispatchFence ||
      dispatch.generation !== input.task.executionGeneration ||
      !dispatch.agentId ||
      dispatch.policyRevision === null
    )
      return failure('stale_fence', 'Dispatch contract is not current');

    const [runRow] = await db
      .select({
        executionEpoch: taskTopics.executionEpoch,
        executionGrantId: taskTopics.executionGrantId,
      })
      .from(taskTopics)
      .where(and(eq(taskTopics.taskId, input.task.taskId), eq(taskTopics.topicId, input.topicId)))
      .limit(1);
    let grantId = runRow?.executionGrantId ?? undefined;
    let executionEpoch = runRow?.executionEpoch ?? undefined;
    if (!grantId || !executionEpoch) {
      try {
        const delegation = new AgentDelegationService(db, userId, taskWorkspaceId);
        const grant = await delegation.createGrant({
          agentId: dispatch.agentId,
          expiresAt: new Date(Date.now() + DEVICE_RUN_GRANT_TTL_MS),
          task: { id: task.id, projectId: task.projectId, workspaceId: task.workspaceId },
        });
        executionEpoch = await delegation.claimExecutionEpoch({
          grantId: grant.id,
          taskId: input.task.taskId,
          topicId: input.topicId,
        });
        grantId = grant.id;
      } catch (error) {
        return failure(
          'policy_denied',
          `Device run delegation is not mintable: ${errorMessage(error)}`,
        );
      }
    }

    binding = {
      dispatchFence: input.task.dispatchFence,
      dispatchId: input.task.dispatchId,
      executionEpoch,
      generation: input.task.executionGeneration,
      grantId,
      operationId: input.operationId,
      policyRevision: dispatch.policyRevision,
      runtimeLeaseId: randomUUID(),
      runtimeOwnerId: deviceRuntimeOwnerId(input.deviceId),
      runtimeRegistrationId: randomUUID(),
      stateRevision: task.domainRevision,
      taskId: input.task.taskId,
      topicId: input.topicId,
      userId,
      workspaceId: taskWorkspaceId,
    };

    try {
      await new TaskExecutionControlModel(db, userId, taskWorkspaceId).register(
        binding,
        DEVICE_BROKER_LEASE_MS,
      );
    } catch (error) {
      return failure('policy_denied', `Device run registration failed: ${errorMessage(error)}`);
    }
  }

  let credential: string;
  try {
    credential = await signHeteroOperationJWT({
      capabilities: ['prime:infer'],
      deviceId: input.deviceId,
      modelRoute: capability.modelRoute,
      operationId: input.operationId,
      userId,
      workspaceId,
    });
  } catch (error) {
    return failure(
      'policy_denied',
      `Device broker credential is not mintable: ${errorMessage(error)}`,
    );
  }

  return {
    ok: true,
    value: {
      binding,
      descriptor: {
        artifact: {
          bytes: manifest.bytes,
          commit: manifest.prime.commit,
          license: manifest.prime.license,
          sha256: manifest.sha256,
          version: manifest.prime.version,
        },
        broker: { credential },
        lease: { ttlMs: DEVICE_SIDE_LEASE_TTL_MS },
        model: { id: capability.modelRoute, maxOutputTokens: capability.maxOutputTokens },
        subject: input.task
          ? {
              dispatchId: input.task.dispatchId,
              kind: 'task' as const,
              taskId: input.task.taskId,
            }
          : { kind: 'conversation' as const, topicId: input.topicId },
      },
    },
  };
};

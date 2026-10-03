import { and, eq } from 'drizzle-orm';

import { agentOperations } from '../schemas/agentOperations';
import type { TaskExecutionControl } from '../schemas/taskExecutionControl';
import { topics } from '../schemas/topic';
import { workspaceMembers } from '../schemas/workspace';
import type { OrviloDatabase, Transaction } from '../type';
import type { HandoffIntent, RuntimeIdentity, RuntimeRunBinding } from './taskExecutionControl';

/**
 * Chat-scoped run binding: the `agent_operations` row is the chat-parallel
 * execution record — it plays the dispatch, grant and run-row roles at once.
 * `operationId` stands in for `dispatchId`/`grantId`, `generation`/`epoch` are
 * 1, `dispatchFence` is 0, and `workspaceId` is the run tenant
 * (`chatWorkspaceId ?? 'personal:<userId>'` — never null, so a
 * personal run cannot collide with a workspace-scoped fence). The run's
 * `subject` is `{kind:'conversation',topicId}` — a conversation id never
 * stands in for a task id (device-execution-contract). Chat runs carry
 * no grant row; `runExpiresAt` is the bounded window the server minted at
 * admission, the chat parallel of a delegated grant's expiry.
 */
export interface ChatRunBinding extends RuntimeRunBinding {
  chatAgentId: string;
  chatWorkspaceId: string | null;
  runExpiresAt: number;
}

interface ChatOperationMetadata extends Record<string, unknown> {
  executionControl?: TaskExecutionControl;
  executionControlRevision?: number;
}

function fail(message: string): never {
  throw new Error(message);
}

const isChatRunBinding = (binding: RuntimeRunBinding): binding is ChatRunBinding =>
  binding.subject.kind === 'conversation' &&
  binding.subject.topicId === binding.topicId &&
  typeof (binding as ChatRunBinding).chatAgentId === 'string' &&
  ((binding as ChatRunBinding).chatWorkspaceId === null ||
    typeof (binding as ChatRunBinding).chatWorkspaceId === 'string') &&
  Number.isFinite((binding as ChatRunBinding).runExpiresAt);

const assertChatRunBinding = (binding: RuntimeRunBinding): ChatRunBinding => {
  if (!isChatRunBinding(binding)) fail('Chat run binding is missing its chat execution context');
  return binding;
};
const bounded = (value: number) => Number.isSafeInteger(value) && value > 0 && value <= 300_000;

/**
 * Canonical process ownership for chat runs, stored on
 * `agent_operations.metadata.executionControl` — the chat-parallel of
 * `task_topics.execution_control`. Same blob shape, same ownership and state
 * rules; the fence differences are structural (operation status is the kill
 * fence, no grant/dispatch rows exist). Callers are trusted server adapters;
 * runtime payloads cannot invoke this model.
 */
export class ChatExecutionControlModel {
  constructor(
    private readonly db: OrviloDatabase,
    private readonly userId: string,
    private readonly tenantId: string,
  ) {}

  private async load(tx: Transaction, b: ChatRunBinding) {
    if (b.workspaceId !== this.tenantId || b.userId !== this.userId) fail('Foreign runtime scope');
    // Try locks avoid a deadlock with legacy dispatch-first writers; no side
    // effect is admitted until the entire canonical snapshot is locked.
    const [operation] = await tx
      .select()
      .from(agentOperations)
      .where(eq(agentOperations.id, b.operationId))
      .for('update', { noWait: true })
      .limit(1);
    const [topic] = await tx
      .select({
        deletedAt: topics.deletedAt,
        id: topics.id,
        isDeleted: topics.isDeleted,
        workspaceId: topics.workspaceId,
      })
      .from(topics)
      .where(eq(topics.id, b.topicId))
      .for('update', { noWait: true })
      .limit(1);
    if (
      !operation ||
      operation.status !== 'running' ||
      operation.agentId !== b.chatAgentId ||
      operation.topicId !== b.topicId ||
      operation.userId !== b.userId ||
      operation.taskId !== null ||
      (operation.workspaceId ?? null) !== b.chatWorkspaceId
    )
      fail('Stale runtime contract');
    if (
      !topic ||
      topic.isDeleted ||
      topic.deletedAt ||
      (topic.workspaceId ?? null) !== b.chatWorkspaceId ||
      b.runExpiresAt <= Date.now()
    )
      fail('Stale runtime contract');
    if (b.chatWorkspaceId) {
      const [member] = await tx
        .select()
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, b.chatWorkspaceId),
            eq(workspaceMembers.userId, this.userId),
          ),
        )
        .for('update', { noWait: true })
        .limit(1);
      if (!member || member.deletedAt || member.suspendedAt) fail('Delegation membership changed');
    }
    return { operation };
  }

  private owns(control: TaskExecutionControl | undefined, b: ChatRunBinding) {
    return (
      !!control &&
      control.version === 1 &&
      !!control.ownerId &&
      !!control.leaseId &&
      !!control.registrationId &&
      Number.isSafeInteger(control.leaseExpiresAt) &&
      control.leaseExpiresAt > 0 &&
      ['registering', 'running', 'held', 'stopped'].includes(control.state) &&
      ((control.state !== 'running' && control.state !== 'held') ||
        (!!control.treeId && !!control.supervisorId && !!control.sessionId)) &&
      (control.state !== 'running' || control.activeHandoffId === null) &&
      control.registrationId === b.runtimeRegistrationId &&
      control.ownerId === b.runtimeOwnerId &&
      control.leaseId === b.runtimeLeaseId
    );
  }

  private async write(
    tx: Transaction,
    operationId: string,
    metadata: ChatOperationMetadata,
    control: TaskExecutionControl,
  ) {
    await tx
      .update(agentOperations)
      .set({
        metadata: {
          ...metadata,
          executionControl: control,
          executionControlRevision: (metadata.executionControlRevision ?? 0) + 1,
        },
      })
      .where(eq(agentOperations.id, operationId));
    return control;
  }

  /** Renew only the exact live owner; bounded by the run window, never past it. */
  async renew(runBinding: RuntimeRunBinding, leaseMs: number) {
    const binding = assertChatRunBinding(runBinding);
    if (!bounded(leaseMs)) fail('Invalid runtime lease');
    return this.db.transaction(async (tx) => {
      const { operation } = await this.load(tx, binding);
      const metadata = (operation.metadata ?? {}) as ChatOperationMetadata;
      const control = metadata.executionControl;
      if (
        !this.owns(control, binding) ||
        control!.state !== 'running' ||
        control!.activeHandoffId !== null ||
        control!.leaseExpiresAt <= Date.now()
      )
        fail('Runtime lease is not renewable');
      return this.write(tx, operation.id, metadata, {
        ...control!,
        leaseExpiresAt: Math.min(Date.now() + leaseMs, binding.runExpiresAt),
      });
    });
  }

  async register(runBinding: RuntimeRunBinding, leaseMs: number) {
    const binding = assertChatRunBinding(runBinding);
    if (
      !bounded(leaseMs) ||
      !binding.runtimeRegistrationId ||
      !binding.runtimeOwnerId ||
      !binding.runtimeLeaseId
    )
      fail('Invalid registration');
    return this.db.transaction(async (tx) => {
      const { operation } = await this.load(tx, binding);
      const metadata = (operation.metadata ?? {}) as ChatOperationMetadata;
      const existing = metadata.executionControl;
      if (existing) {
        if (
          !this.owns(existing, binding) ||
          existing.leaseExpiresAt <= Date.now() ||
          !['registering', 'running'].includes(existing.state)
        )
          fail('Runtime already registered or unavailable');
        return existing;
      }
      return this.write(tx, operation.id, metadata, {
        version: 1,
        registrationId: binding.runtimeRegistrationId,
        ownerId: binding.runtimeOwnerId,
        leaseId: binding.runtimeLeaseId,
        leaseExpiresAt: Math.min(Date.now() + leaseMs, binding.runExpiresAt),
        state: 'registering',
        treeId: null,
        supervisorId: null,
        sessionId: null,
        activeHandoffId: null,
      });
    });
  }

  async activate(runBinding: RuntimeRunBinding, identity: RuntimeIdentity) {
    const binding = assertChatRunBinding(runBinding);
    if (!identity.treeId || !identity.supervisorId || !identity.sessionId)
      fail('Missing runtime identity');
    return this.db.transaction(async (tx) => {
      const { operation } = await this.load(tx, binding);
      const metadata = (operation.metadata ?? {}) as ChatOperationMetadata;
      const control = metadata.executionControl;
      if (
        !this.owns(control, binding) ||
        !control ||
        control.activeHandoffId ||
        control.leaseExpiresAt <= Date.now()
      )
        fail('Registration no longer owned');
      if (control.state === 'running') {
        if (
          control.treeId !== identity.treeId ||
          control.supervisorId !== identity.supervisorId ||
          control.sessionId !== identity.sessionId
        )
          fail('Different runtime already activated');
        return control;
      }
      if (control.state !== 'registering') fail('Runtime admission held');
      return this.write(tx, operation.id, metadata, {
        ...control,
        ...identity,
        state: 'running' as const,
      });
    });
  }

  /**
   * Stopping may only fence the exact registered process owner. The operation
   * status is the chat kill fence — a settled or interrupted run (status left
   * 'running') fails the match, which is the same drain-miss the task path
   * logs once its dispatch fence has advanced; the run is already durably
   * finished at that point.
   */
  async stop(runBinding: RuntimeRunBinding) {
    const binding = assertChatRunBinding(runBinding);
    if (binding.workspaceId !== this.tenantId || binding.userId !== this.userId)
      fail('Foreign stop scope');
    return this.db.transaction(async (tx) => {
      const [operation] = await tx
        .select()
        .from(agentOperations)
        .where(eq(agentOperations.id, binding.operationId))
        .for('update', { noWait: true })
        .limit(1);
      const metadata = (operation?.metadata ?? {}) as ChatOperationMetadata;
      const control = metadata.executionControl;
      if (
        !operation ||
        operation.topicId !== binding.topicId ||
        operation.agentId !== binding.chatAgentId ||
        operation.userId !== binding.userId ||
        (operation.workspaceId ?? null) !== binding.chatWorkspaceId ||
        !control ||
        !this.owns(control, binding)
      )
        fail('Stop process owner changed');
      if (control.state === 'stopped') return operation;
      if (control.state === 'held' || control.activeHandoffId)
        fail('Handoff requires source quiescence without dispatch cancellation');
      if (operation.status !== 'running') fail('Stop dispatch changed');
      await this.write(tx, operation.id, metadata, { ...control, state: 'stopped' });
      return operation;
    });
  }

  async readControl(runBinding: RuntimeRunBinding) {
    const binding = assertChatRunBinding(runBinding);
    if (binding.workspaceId !== this.tenantId || binding.userId !== this.userId) return undefined;
    const [operation] = await this.db
      .select({ metadata: agentOperations.metadata })
      .from(agentOperations)
      .where(eq(agentOperations.id, binding.operationId))
      .limit(1);
    if (!operation) return undefined;
    const metadata = (operation.metadata ?? {}) as ChatOperationMetadata;
    return {
      control: metadata.executionControl ?? null,
      epoch: binding.executionEpoch,
      revision: metadata.executionControlRevision ?? 0,
    };
  }

  /** Chat runs never hand off — no handoff rows exist to read. */
  async read(_id: string) {
    return undefined;
  }

  /** Chat runs are single-registration: the handoff family is unreachable. */
  async beginHandoff(_binding: RuntimeRunBinding, _intent: HandoffIntent): Promise<never> {
    return fail('Chat runs do not admit handoffs');
  }

  async advance(_id: string, _revision: number, _state: 'quiescent' | 'quiescing'): Promise<never> {
    return fail('Chat runs do not admit handoffs');
  }

  async transfer(_id: string, _revision: number): Promise<never> {
    return fail('Chat runs do not admit handoffs');
  }

  async resume(_id: string, _revision: number, _identity: RuntimeIdentity): Promise<never> {
    return fail('Chat runs do not admit handoffs');
  }
}

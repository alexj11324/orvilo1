import { and, eq } from 'drizzle-orm';

import { executionGrants } from '../schemas/executionGrant';
import { taskDispatches, tasks, taskTopics } from '../schemas/task';
import {
  type TaskExecutionControl,
  taskExecutionHandoffs,
  type TaskExecutionProof,
} from '../schemas/taskExecutionControl';
import { topics } from '../schemas/topic';
import { workspaceMembers } from '../schemas/workspace';
import type { OrviloDatabase, Transaction } from '../type';
import { TaskDispatchModel } from './taskDispatch';

export interface RuntimeRunBinding {
  dispatchFence: number;
  dispatchId: string;
  executionEpoch: number;
  generation: number;
  grantId: string;
  operationId: string;
  policyRevision: number;
  runtimeLeaseId: string;
  runtimeOwnerId: string;
  runtimeRegistrationId: string;
  stateRevision: number;
  taskId: string;
  topicId: string;
  userId: string;
  workspaceId: string;
}
export interface HandoffIntent {
  id: string;
  leaseMs: number;
  successorLeaseId: string;
  successorOwnerId: string;
  successorRegistrationId: string;
}
export interface RuntimeIdentity {
  sessionId: string;
  supervisorId: string;
  treeId: string;
}
function fail(message: string): never {
  throw new Error(message);
}
const bounded = (value: number) => Number.isSafeInteger(value) && value > 0 && value <= 300_000;

/** Canonical process ownership on task_topics. History is not another live authority.
 * Callers are trusted server adapters; runtime payloads cannot invoke this model.
 * All admissions and legacy epoch writers must honor executionControl before enabling Core. */
export class TaskExecutionControlModel {
  constructor(
    private readonly db: OrviloDatabase,
    private readonly userId: string,
    private readonly workspaceId: string,
  ) {}

  private async load(tx: Transaction, b: RuntimeRunBinding) {
    if (b.workspaceId !== this.workspaceId || b.userId !== this.userId)
      fail('Foreign runtime scope');
    // Try locks avoid a deadlock with legacy dispatch-first writers; no side effect
    // is admitted until the entire canonical snapshot is locked.
    const [task] = await tx
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, b.taskId), eq(tasks.workspaceId, this.workspaceId)))
      .for('update', { noWait: true })
      .limit(1);
    const [dispatch] = await tx
      .select()
      .from(taskDispatches)
      .where(
        and(eq(taskDispatches.id, b.dispatchId), eq(taskDispatches.workspaceId, this.workspaceId)),
      )
      .for('update', { noWait: true })
      .limit(1);
    if (
      !task ||
      !dispatch ||
      task.isDeleted ||
      task.deletedAt ||
      task.status !== 'running' ||
      task.currentTopicId !== b.topicId ||
      dispatch.taskId !== b.taskId ||
      dispatch.phase !== 'running' ||
      dispatch.operationId !== b.operationId ||
      dispatch.fence !== b.dispatchFence ||
      dispatch.generation !== b.generation ||
      task.executionGeneration !== b.generation ||
      task.domainRevision !== b.stateRevision ||
      task.policyRevision !== b.policyRevision ||
      dispatch.policyRevision !== task.policyRevision ||
      dispatch.requirementRevision !== task.requirementRevision ||
      !dispatch.agentId ||
      task.assigneeAgentId !== dispatch.agentId
    )
      fail('Stale runtime contract');
    const [grant] = await tx
      .select()
      .from(executionGrants)
      .where(
        and(eq(executionGrants.id, b.grantId), eq(executionGrants.workspaceId, this.workspaceId)),
      )
      .for('update', { noWait: true })
      .limit(1);
    const [topic] = await tx
      .select()
      .from(taskTopics)
      .where(
        and(
          eq(taskTopics.taskId, b.taskId),
          eq(taskTopics.topicId, b.topicId),
          eq(taskTopics.workspaceId, this.workspaceId),
        ),
      )
      .for('update', { noWait: true })
      .limit(1);
    const [member] = await tx
      .select()
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.userId, this.userId),
          eq(workspaceMembers.workspaceId, this.workspaceId),
        ),
      )
      .for('update', { noWait: true })
      .limit(1);
    if (
      !grant ||
      grant.taskId !== b.taskId ||
      grant.agentId !== dispatch.agentId ||
      grant.delegationSubjectType !== 'user' ||
      grant.delegationSubjectId !== this.userId ||
      grant.status !== 'active' ||
      grant.revokedAt ||
      !grant.expiresAt ||
      grant.expiresAt.getTime() <= Date.now() ||
      !grant.allowedActions.includes('run') ||
      !member ||
      member.deletedAt ||
      member.suspendedAt ||
      member.authzVersion !== grant.authzVersions?.workspaceAuthzVersion
    )
      fail('Runtime delegation denied');
    if (
      !topic ||
      topic.status !== 'running' ||
      topic.operationId !== b.operationId ||
      topic.dispatchId !== b.dispatchId ||
      topic.dispatchFence !== b.dispatchFence ||
      topic.executionGeneration !== b.generation ||
      topic.policyRevision !== b.policyRevision ||
      topic.requirementRevision !== task.requirementRevision ||
      topic.executionGrantId !== b.grantId ||
      topic.executionEpoch !== b.executionEpoch ||
      (grant.taskTopicId !== null && grant.taskTopicId !== topic.id)
    )
      fail('Stale delegated runtime');
    const [contentTopic] = await tx
      .select({ id: topics.id, isDeleted: topics.isDeleted, deletedAt: topics.deletedAt })
      .from(topics)
      .where(and(eq(topics.id, b.topicId), eq(topics.workspaceId, this.workspaceId)))
      .for('update', { noWait: true })
      .limit(1);
    if (!contentTopic || contentTopic.isDeleted || contentTopic.deletedAt)
      fail('Runtime topic deleted');
    return { topic, grant };
  }

  private owns(control: TaskExecutionControl | null, b: RuntimeRunBinding) {
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

  /** Renew only the exact live owner; held handoffs cannot extend their source lease. */
  async renew(binding: RuntimeRunBinding, leaseMs: number) {
    if (!bounded(leaseMs)) fail('Invalid runtime lease');
    return this.db.transaction(async (tx) => {
      const { topic, grant } = await this.load(tx, binding);
      const control = topic.executionControl;
      if (
        !this.owns(control, binding) ||
        control!.state !== 'running' ||
        control!.activeHandoffId !== null ||
        control!.leaseExpiresAt <= Date.now()
      )
        fail('Runtime lease is not renewable');
      const next = {
        ...control!,
        leaseExpiresAt: Math.min(Date.now() + leaseMs, grant.expiresAt!.getTime()),
      };
      await tx
        .update(taskTopics)
        .set({
          executionControl: next,
          executionControlRevision: topic.executionControlRevision + 1,
        })
        .where(eq(taskTopics.id, topic.id));
      return next;
    });
  }

  async register(binding: RuntimeRunBinding, leaseMs: number) {
    if (
      !bounded(leaseMs) ||
      !binding.runtimeRegistrationId ||
      !binding.runtimeOwnerId ||
      !binding.runtimeLeaseId
    )
      fail('Invalid registration');
    return this.db.transaction(async (tx) => {
      const { topic, grant } = await this.load(tx, binding);
      if (topic.executionControl) {
        if (
          !this.owns(topic.executionControl, binding) ||
          topic.executionControl.leaseExpiresAt <= Date.now() ||
          !['registering', 'running'].includes(topic.executionControl.state)
        )
          fail('Runtime already registered or unavailable');
        return topic.executionControl;
      }
      const control: TaskExecutionControl = {
        version: 1,
        registrationId: binding.runtimeRegistrationId,
        ownerId: binding.runtimeOwnerId,
        leaseId: binding.runtimeLeaseId,
        leaseExpiresAt: Math.min(Date.now() + leaseMs, grant.expiresAt!.getTime()),
        state: 'registering',
        treeId: null,
        supervisorId: null,
        sessionId: null,
        activeHandoffId: null,
      };
      await tx
        .update(taskTopics)
        .set({
          executionControl: control,
          executionControlRevision: topic.executionControlRevision + 1,
        })
        .where(eq(taskTopics.id, topic.id));
      return control;
    });
  }

  async activate(binding: RuntimeRunBinding, identity: RuntimeIdentity) {
    if (!identity.treeId || !identity.supervisorId || !identity.sessionId)
      fail('Missing runtime identity');
    return this.db.transaction(async (tx) => {
      const { topic } = await this.load(tx, binding);
      const control = topic.executionControl;
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
      const next = { ...control, ...identity, state: 'running' as const };
      await tx
        .update(taskTopics)
        .set({
          executionControl: next,
          executionControlRevision: topic.executionControlRevision + 1,
        })
        .where(eq(taskTopics.id, topic.id));
      return next;
    });
  }

  /** Stopping does not require a still-live grant, but may only fence the exact
   * registered process owner. It cannot cancel a successor sharing the dispatch. */
  async stop(binding: RuntimeRunBinding) {
    if (binding.workspaceId !== this.workspaceId || binding.userId !== this.userId)
      fail('Foreign stop scope');
    return this.db.transaction(async (tx) => {
      const [task] = await tx
        .select()
        .from(tasks)
        .where(and(eq(tasks.id, binding.taskId), eq(tasks.workspaceId, this.workspaceId)))
        .for('update', { noWait: true })
        .limit(1);
      const [dispatch] = await tx
        .select()
        .from(taskDispatches)
        .where(
          and(
            eq(taskDispatches.id, binding.dispatchId),
            eq(taskDispatches.workspaceId, this.workspaceId),
          ),
        )
        .for('update', { noWait: true })
        .limit(1);
      const [topic] = await tx
        .select()
        .from(taskTopics)
        .where(
          and(
            eq(taskTopics.taskId, binding.taskId),
            eq(taskTopics.topicId, binding.topicId),
            eq(taskTopics.workspaceId, this.workspaceId),
          ),
        )
        .for('update', { noWait: true })
        .limit(1);
      const control = topic?.executionControl;
      if (
        !task ||
        task.currentTopicId !== binding.topicId ||
        task.executionGeneration !== binding.generation ||
        !dispatch ||
        dispatch.taskId !== binding.taskId ||
        dispatch.operationId !== binding.operationId ||
        dispatch.generation !== binding.generation ||
        !topic ||
        topic.executionEpoch !== binding.executionEpoch ||
        topic.executionGrantId !== binding.grantId ||
        !control ||
        !this.owns(control, binding)
      )
        fail('Stop process owner changed');
      if (
        control.activeHandoffId &&
        (control.state === 'registering' || control.state === 'stopped')
      ) {
        // Failed successor startup stays closed without invalidating the still-held
        // handoff dispatch. A stopped registration cannot later resume blindly.
        if (dispatch.phase !== 'running' || dispatch.fence !== binding.dispatchFence)
          fail('Successor dispatch changed');
        if (control.state !== 'stopped')
          await tx
            .update(taskTopics)
            .set({
              executionControl: { ...control, state: 'stopped' },
              executionControlRevision: topic.executionControlRevision + 1,
            })
            .where(eq(taskTopics.id, topic.id));
        return dispatch;
      }
      if (control.state === 'held' || control.activeHandoffId)
        fail('Handoff requires source quiescence without dispatch cancellation');
      if (
        dispatch.phase === 'cancel_requested' &&
        dispatch.fence === binding.dispatchFence + 1 &&
        control.state === 'stopped'
      )
        return dispatch;
      if (dispatch.phase !== 'running' || dispatch.fence !== binding.dispatchFence)
        fail('Stop dispatch changed');
      const stopped = await new TaskDispatchModel(
        tx as OrviloDatabase,
        this.workspaceId,
      ).requestStop({
        dispatchId: binding.dispatchId,
        fence: binding.dispatchFence,
        generation: binding.generation,
        operationId: binding.operationId,
        reason: 'core_runtime_stop',
      });
      if (!stopped) fail('Stop could not fence dispatch');
      await tx
        .update(taskTopics)
        .set({
          executionControl: { ...control, state: 'stopped' },
          executionControlRevision: topic.executionControlRevision + 1,
        })
        .where(eq(taskTopics.id, topic.id));
      return stopped;
    });
  }

  async readControl(binding: RuntimeRunBinding) {
    const [topic] = await this.db
      .select()
      .from(taskTopics)
      .where(
        and(
          eq(taskTopics.taskId, binding.taskId),
          eq(taskTopics.topicId, binding.topicId),
          eq(taskTopics.workspaceId, this.workspaceId),
        ),
      )
      .limit(1);
    if (binding.workspaceId !== this.workspaceId || binding.userId !== this.userId)
      return undefined;
    return topic
      ? {
          control: topic.executionControl,
          revision: topic.executionControlRevision,
          epoch: topic.executionEpoch,
        }
      : undefined;
  }

  async read(id: string) {
    const [row] = await this.db
      .select()
      .from(taskExecutionHandoffs)
      .where(
        and(
          eq(taskExecutionHandoffs.id, id),
          eq(taskExecutionHandoffs.workspaceId, this.workspaceId),
          eq(taskExecutionHandoffs.userId, this.userId),
        ),
      )
      .limit(1);
    return row;
  }

  async beginHandoff(binding: RuntimeRunBinding, intent: HandoffIntent) {
    if (binding.workspaceId !== this.workspaceId || binding.userId !== this.userId)
      fail('Foreign runtime scope');
    if (
      !intent.id ||
      !intent.successorOwnerId ||
      intent.successorOwnerId === binding.runtimeOwnerId ||
      !intent.successorRegistrationId ||
      intent.successorRegistrationId === binding.runtimeRegistrationId ||
      !intent.successorLeaseId ||
      intent.successorLeaseId === binding.runtimeLeaseId ||
      !bounded(intent.leaseMs)
    )
      fail('Invalid handoff intent');
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(taskExecutionHandoffs)
        .where(eq(taskExecutionHandoffs.id, intent.id))
        .limit(1);
      if (existing) {
        const [existingTopic] = await tx
          .select({ topicId: taskTopics.topicId })
          .from(taskTopics)
          .where(eq(taskTopics.id, existing.taskTopicId))
          .limit(1);
        const r = existing.record;
        if (
          existing.workspaceId !== this.workspaceId ||
          existing.userId !== this.userId ||
          existing.taskId !== binding.taskId ||
          existingTopic?.topicId !== binding.topicId ||
          r.sourceEpoch !== binding.executionEpoch ||
          r.source.registrationId !== binding.runtimeRegistrationId ||
          r.source.ownerId !== binding.runtimeOwnerId ||
          r.source.leaseId !== binding.runtimeLeaseId ||
          r.grantId !== binding.grantId ||
          r.dispatchId !== binding.dispatchId ||
          r.dispatchFence !== binding.dispatchFence ||
          r.operationId !== binding.operationId ||
          r.generation !== binding.generation ||
          r.policyRevision !== binding.policyRevision ||
          r.stateRevision !== binding.stateRevision ||
          r.successorOwnerId !== intent.successorOwnerId ||
          r.successorRegistrationId !== intent.successorRegistrationId ||
          r.successorLeaseId !== intent.successorLeaseId ||
          r.leaseMs !== intent.leaseMs
        )
          fail('Conflicting handoff intent');
        return existing;
      }
      const { topic } = await this.load(tx, binding);
      const control = topic.executionControl;
      if (
        !control ||
        !this.owns(control, binding) ||
        control.state !== 'running' ||
        control.activeHandoffId ||
        control.leaseExpiresAt <= Date.now()
      )
        fail('Runtime not available for handoff');
      const held = { ...control, state: 'held' as const, activeHandoffId: intent.id };
      const [created] = await tx
        .insert(taskExecutionHandoffs)
        .values({
          id: intent.id,
          taskId: binding.taskId,
          taskTopicId: topic.id,
          workspaceId: this.workspaceId,
          userId: this.userId,
          phase: 'prepared',
          revision: 0,
          record: {
            source: control,
            sourceEpoch: topic.executionEpoch,
            grantId: binding.grantId,
            dispatchId: binding.dispatchId,
            dispatchFence: binding.dispatchFence,
            generation: binding.generation,
            operationId: binding.operationId,
            policyRevision: binding.policyRevision,
            stateRevision: binding.stateRevision,
            heldAt: Date.now(),
            ...intent,
          },
        })
        .returning();
      await tx
        .update(taskTopics)
        .set({
          executionControl: held,
          executionControlRevision: topic.executionControlRevision + 1,
        })
        .where(eq(taskTopics.id, topic.id));
      return created;
    });
  }

  private async context(tx: Transaction, id: string, revision: number, successor = false) {
    const [history] = await tx
      .select()
      .from(taskExecutionHandoffs)
      .where(
        and(
          eq(taskExecutionHandoffs.id, id),
          eq(taskExecutionHandoffs.workspaceId, this.workspaceId),
          eq(taskExecutionHandoffs.userId, this.userId),
        ),
      )
      .limit(1);
    if (!history) fail('Unknown handoff');
    const [topic] = await tx
      .select({ taskId: taskTopics.taskId, topicId: taskTopics.topicId })
      .from(taskTopics)
      .where(eq(taskTopics.id, history.taskTopicId))
      .limit(1);
    if (!topic?.topicId) fail('Handoff run disappeared');
    const r = history.record;
    const b: RuntimeRunBinding = {
      workspaceId: this.workspaceId,
      userId: this.userId,
      taskId: topic.taskId,
      topicId: topic.topicId,
      dispatchId: r.dispatchId,
      dispatchFence: r.dispatchFence,
      generation: r.generation,
      operationId: r.operationId,
      grantId: r.grantId,
      executionEpoch: r.sourceEpoch + (successor ? 1 : 0),
      policyRevision: r.policyRevision,
      stateRevision: r.stateRevision,
      runtimeOwnerId: successor ? r.successorOwnerId : r.source.ownerId,
      runtimeRegistrationId: successor ? r.successorRegistrationId : r.source.registrationId,
      runtimeLeaseId: successor ? r.successorLeaseId : r.source.leaseId,
    };
    const loaded = await this.load(tx, b);
    const [current] = await tx
      .select()
      .from(taskExecutionHandoffs)
      .where(eq(taskExecutionHandoffs.id, id))
      .for('update', { noWait: true })
      .limit(1);
    if (
      !current ||
      (current.revision !== revision &&
        !(successor && current.phase === 'resumed' && current.revision === revision + 1)) ||
      !this.owns(loaded.topic.executionControl, b) ||
      (loaded.topic.executionControl?.activeHandoffId !== id &&
        !(
          successor &&
          current.phase === 'resumed' &&
          loaded.topic.executionControl?.activeHandoffId === null
        ))
    )
      fail('Handoff revision or owner changed');
    return { ...loaded, current, binding: b };
  }

  async advance(
    id: string,
    revision: number,
    phase: 'quiescing' | 'quiescent',
    proof?: TaskExecutionProof,
  ) {
    return this.db.transaction(async (tx) => {
      const { current, topic } = await this.context(tx, id, revision);
      if (
        (phase === 'quiescing' && current.phase !== 'prepared') ||
        (phase === 'quiescent' && current.phase !== 'quiescing') ||
        topic.executionControl?.state !== 'held'
      )
        fail('Invalid handoff phase');
      if (
        phase === 'quiescent' &&
        (!proof ||
          proof.treeId !== current.record.source.treeId ||
          proof.supervisorId !== current.record.source.supervisorId ||
          proof.remainingProcesses !== 0 ||
          proof.pendingActions !== 0 ||
          !Number.isFinite(proof.observedAt) ||
          proof.observedAt < current.record.heldAt ||
          proof.observedAt > Date.now())
      )
        fail('Invalid quiescence proof');
      const [next] = await tx
        .update(taskExecutionHandoffs)
        .set({
          phase,
          revision: revision + 1,
          record: { ...current.record, ...(proof ? { proof } : {}) },
        })
        .where(eq(taskExecutionHandoffs.id, id))
        .returning();
      return next;
    });
  }

  async transfer(id: string, revision: number) {
    return this.db.transaction(async (tx) => {
      const { current, topic, grant } = await this.context(tx, id, revision);
      const r = current.record;
      if (
        current.phase !== 'quiescent' ||
        !r.proof ||
        topic.executionControl?.state !== 'held' ||
        topic.executionControl.leaseExpiresAt <= Date.now()
      )
        fail('Source quiescence unavailable');
      const next: TaskExecutionControl = {
        version: 1,
        registrationId: r.successorRegistrationId,
        ownerId: r.successorOwnerId,
        leaseId: r.successorLeaseId,
        leaseExpiresAt: Math.min(Date.now() + r.leaseMs, grant.expiresAt!.getTime()),
        state: 'registering',
        treeId: null,
        supervisorId: null,
        sessionId: null,
        activeHandoffId: id,
      };
      await tx
        .update(taskTopics)
        .set({
          executionEpoch: r.sourceEpoch + 1,
          executionControl: next,
          executionControlRevision: topic.executionControlRevision + 1,
        })
        .where(eq(taskTopics.id, topic.id));
      const [record] = await tx
        .update(taskExecutionHandoffs)
        .set({ phase: 'transferred', revision: revision + 1 })
        .where(eq(taskExecutionHandoffs.id, id))
        .returning();
      return { record, control: next, epoch: r.sourceEpoch + 1 };
    });
  }

  async resume(id: string, revision: number, identity: RuntimeIdentity) {
    if (!identity.treeId || !identity.supervisorId || !identity.sessionId)
      fail('Missing successor identity');
    return this.db.transaction(async (tx) => {
      const { current, topic } = await this.context(tx, id, revision, true);
      if (current.phase === 'resumed') {
        const control = topic.executionControl!;
        if (
          control.state !== 'running' ||
          control.leaseExpiresAt <= Date.now() ||
          control.treeId !== identity.treeId ||
          control.supervisorId !== identity.supervisorId ||
          control.sessionId !== identity.sessionId
        )
          fail('Successor registration identity changed');
        return { record: current, control, epoch: topic.executionEpoch };
      }
      if (
        current.phase !== 'transferred' ||
        topic.executionControl?.state !== 'registering' ||
        topic.executionControl.leaseExpiresAt <= Date.now()
      )
        fail('Successor registration unavailable');
      const next = {
        ...topic.executionControl,
        ...identity,
        state: 'running' as const,
        activeHandoffId: null,
      };
      await tx
        .update(taskTopics)
        .set({
          executionControl: next,
          executionControlRevision: topic.executionControlRevision + 1,
        })
        .where(eq(taskTopics.id, topic.id));
      const [record] = await tx
        .update(taskExecutionHandoffs)
        .set({ phase: 'resumed', revision: revision + 1 })
        .where(eq(taskExecutionHandoffs.id, id))
        .returning();
      return { record, control: next, epoch: topic.executionEpoch };
    });
  }
}

import type { ControlResult, ExecutionFence, HandoffRecord, QuiescenceProof } from './contracts';
import { CONTROL_PLANE_VERSION } from './contracts';

/** Implement in the authoritative control DB; all operations are durable transactions. */
export interface HandoffPersistence {
  /** Validate authority, current fence and live lease; hold mutation admission before returning.
   * One active handoff per task. Same ID+intent returns existing; conflicting intent is denied.
   * Keep the source owner until transfer (never assign null). */
  begin: (record: HandoffRecord) => Promise<ControlResult<HandoffRecord>>;
  compareAndSet: (expected: HandoffRecord, next: HandoffRecord) => Promise<boolean>;
  read: (id: string) => Promise<HandoffRecord | undefined>;
  /** Revalidate current authority/policy and source fence, with admission still held.
   * Atomically persist phase=transferred, owner=successorOwnerId, a fresh lease and epoch+1.
   * Do not reopen mutation admission until the successor is registered. */
  transfer: (expected: HandoffRecord) => Promise<ControlResult<HandoffRecord>>;
}

export interface HandoffSupervisor {
  /** Outside the runtime trust boundary. Stop the entire registered source tree and drain actions.
   * Retry-safe: recovered quiescing records call this again. */
  quiesce: (source: ExecutionFence, handoffId: string) => Promise<ControlResult<QuiescenceProof>>;
  /** Validate tree/supervisor binding to source, fresh observation, and durable admission hold.
   * The supervisor keeps the tree stopped through transfer; a report alone is insufficient. */
  verify: (source: ExecutionFence, handoffId: string, proof: QuiescenceProof) => Promise<boolean>;
}

export interface HandoffSuccessor {
  /** Reauthorize fence/lease/policy and atomically register ONE successor for this durable ID.
   * A crash after launch but before phase=resumed must return the same registered execution.
   * Do not use ordinary non-idempotent runtime.start as this adapter. */
  ensureStarted: (handoffId: string, fence: ExecutionFence) => Promise<ControlResult<void>>;
}

const denied = (
  code: 'handoff_conflict' | 'not_quiescent' | 'invalid_request',
  message: string,
): ControlResult<never> => ({
  ok: false,
  error: { code, message, retryable: code === 'handoff_conflict' },
});

/** Recovery replays the persisted phase, never infers transfer from runtime end_turn. */
export class HandoffCoordinator {
  constructor(
    private readonly persistence: HandoffPersistence,
    private readonly supervisor: HandoffSupervisor,
    private readonly successor: HandoffSuccessor,
  ) {}

  async begin(
    id: string,
    source: ExecutionFence,
    successorOwnerId: string,
  ): Promise<ControlResult<HandoffRecord>> {
    if (!id || !successorOwnerId || successorOwnerId === source.ownerId) {
      return denied('invalid_request', 'Handoff requires an ID and a different successor owner.');
    }
    if (source.taskId === null)
      return denied('invalid_request', 'Handoff requires a task run subject.');
    return this.persistence.begin({
      schemaVersion: CONTROL_PLANE_VERSION,
      id,
      taskId: source.taskId,
      source,
      successorOwnerId,
      phase: 'prepared',
      revision: 0,
    });
  }

  async recover(id: string): Promise<ControlResult<HandoffRecord>> {
    const initial = await this.persistence.read(id);
    if (!initial) return denied('invalid_request', 'Handoff does not exist.');
    let record: HandoffRecord = initial;
    if (
      record.schemaVersion !== CONTROL_PLANE_VERSION ||
      record.id !== id ||
      record.taskId !== record.source.taskId ||
      !['prepared', 'quiescing', 'quiescent', 'transferred', 'resumed'].includes(record.phase)
    ) {
      return denied('invalid_request', 'Persisted handoff identity, version or phase is invalid.');
    }
    if (
      (record.phase === 'transferred' || record.phase === 'resumed') &&
      !this.validSuccessor(record)
    ) {
      return denied('handoff_conflict', 'Persisted successor fence is invalid.');
    }
    while (record.phase !== 'resumed') {
      let next: HandoffRecord;
      switch (record.phase) {
        case 'prepared': {
          next = { ...record, phase: 'quiescing', revision: record.revision + 1 };
          break;
        }
        case 'quiescing': {
          const result = await this.supervisor.quiesce(record.source, record.id);
          if (!result.ok) return result;
          if (!(await this.validProof(record, result.value))) {
            return denied(
              'not_quiescent',
              'Source process tree or pending actions remain unproven.',
            );
          }
          next = {
            ...record,
            phase: 'quiescent',
            quiescence: result.value,
            revision: record.revision + 1,
          };
          break;
        }
        case 'quiescent': {
          if (!record.quiescence || !(await this.validProof(record, record.quiescence))) {
            return denied(
              'not_quiescent',
              'Quiescence proof is missing or no longer authoritative.',
            );
          }
          const result = await this.persistence.transfer(record);
          if (!result.ok) return result;
          const previous = record;
          record = result.value;
          if (
            record.id !== previous.id ||
            record.taskId !== previous.taskId ||
            record.successorOwnerId !== previous.successorOwnerId ||
            record.schemaVersion !== previous.schemaVersion ||
            record.revision !== previous.revision + 1 ||
            Object.keys(previous.source).some(
              (key) =>
                record.source[key as keyof ExecutionFence] !==
                previous.source[key as keyof ExecutionFence],
            )
          ) {
            return denied(
              'handoff_conflict',
              'Persistence changed the handoff identity during transfer.',
            );
          }
          if (record.phase !== 'transferred' || !this.validSuccessor(record)) {
            return denied('handoff_conflict', 'Persistence returned an invalid atomic transfer.');
          }
          continue;
        }
        case 'transferred': {
          if (!record.successor)
            return denied('handoff_conflict', 'Transferred record has no successor fence.');
          const result = await this.successor.ensureStarted(record.id, record.successor);
          if (!result.ok) return result;
          next = { ...record, phase: 'resumed', revision: record.revision + 1 };
          break;
        }
        default: {
          return denied('invalid_request', 'Unexpected handoff phase during recovery.');
        }
      }
      if (!(await this.persistence.compareAndSet(record, next))) {
        return denied(
          'handoff_conflict',
          'Concurrent handoff progress changed the durable revision; retry recovery.',
        );
      }
      record = next;
    }
    return { ok: true, value: record };
  }

  private validSuccessor(record: HandoffRecord): boolean {
    const successor = record.successor;
    return Boolean(
      successor &&
      successor.ownerId === record.successorOwnerId &&
      successor.epoch === record.source.epoch + 1 &&
      successor.taskId === record.taskId &&
      successor.tenantId === record.source.tenantId &&
      successor.principalId === record.source.principalId &&
      successor.grantId === record.source.grantId &&
      successor.leaseId &&
      successor.leaseId !== record.source.leaseId,
    );
  }

  private async validProof(record: HandoffRecord, proof: QuiescenceProof): Promise<boolean> {
    return Boolean(
      proof.treeId &&
      proof.supervisorId &&
      Number.isFinite(proof.observedAt) &&
      proof.remainingProcesses === 0 &&
      proof.pendingActions === 0 &&
      (await this.supervisor.verify(record.source, record.id, proof)),
    );
  }
}

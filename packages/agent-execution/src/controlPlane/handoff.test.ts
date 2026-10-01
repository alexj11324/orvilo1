// @vitest-environment node
import { mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type {
  ControlErrorCode,
  ControlResult,
  ExecutionFence,
  HandoffPhase,
  HandoffRecord,
  QuiescenceProof,
} from './contracts';
import {
  HandoffCoordinator,
  type HandoffPersistence,
  type HandoffSuccessor,
  type HandoffSupervisor,
} from './handoff';

const source: ExecutionFence = {
  tenantId: 'tenant',
  principalId: 'user',
  taskId: 'task',
  grantId: 'grant',
  ownerId: 'old',
  leaseId: 'lease-1',
  epoch: 1,
  policyRevision: 1,
  stateRevision: 1,
};
const success = <T>(value: T): ControlResult<T> => ({ ok: true, value });
const denial = (code: ControlErrorCode): ControlResult<never> => ({
  ok: false,
  error: { code, message: code, retryable: false },
});
interface State {
  expiresAt: number;
  fence: ExecutionFence;
  held: boolean;
  pendingActions: number;
  processes: number;
  record?: HandoffRecord;
  registrations: Record<string, ExecutionFence>;
  revoked: boolean;
}

/** Test-only single-process transaction fixture. JSON survives coordinator/store reconstruction.
 * Atomic rename models durable snapshots, not PostgreSQL or actual OS process supervision. */
class DiskStore implements HandoffPersistence {
  constructor(readonly file: string) {}
  state(): State {
    return JSON.parse(readFileSync(this.file, 'utf8')) as State;
  }
  save(state: State): void {
    writeFileSync(`${this.file}.tmp`, JSON.stringify(state));
    renameSync(`${this.file}.tmp`, this.file);
  }
  authorization(state: State, fence: ExecutionFence): ControlResult<void> {
    if (state.revoked) return denial('revoked');
    if (state.expiresAt <= Date.now()) return denial('lease_expired');
    if (JSON.stringify(state.fence) !== JSON.stringify(fence)) return denial('stale_fence');
    return success(undefined);
  }
  async begin(record: HandoffRecord): Promise<ControlResult<HandoffRecord>> {
    const state = this.state();
    if (state.record) {
      return state.record.id === record.id &&
        state.record.successorOwnerId === record.successorOwnerId &&
        JSON.stringify(state.record.source) === JSON.stringify(record.source)
        ? success(state.record)
        : denial('handoff_conflict');
    }
    const authorized = this.authorization(state, record.source);
    if (!authorized.ok) return authorized;
    state.record = record;
    state.held = true;
    this.save(state);
    return success(record);
  }
  async read(id: string): Promise<HandoffRecord | undefined> {
    const record = this.state().record;
    return record?.id === id ? record : undefined;
  }
  async compareAndSet(expected: HandoffRecord, next: HandoffRecord): Promise<boolean> {
    const state = this.state();
    if (JSON.stringify(state.record) !== JSON.stringify(expected)) return false;
    state.record = next;
    this.save(state);
    return true;
  }
  async transfer(expected: HandoffRecord): Promise<ControlResult<HandoffRecord>> {
    const state = this.state();
    const authorized = this.authorization(state, expected.source);
    if (!authorized.ok) return authorized;
    if (
      !state.held ||
      expected.phase !== 'quiescent' ||
      JSON.stringify(state.record) !== JSON.stringify(expected)
    )
      return denial('handoff_conflict');
    const successor = {
      ...expected.source,
      ownerId: expected.successorOwnerId,
      epoch: expected.source.epoch + 1,
      leaseId: 'lease-2',
      stateRevision: 2,
    };
    state.fence = successor;
    state.record = {
      ...expected,
      successor,
      phase: 'transferred',
      revision: expected.revision + 1,
    };
    this.save(state);
    return success(state.record);
  }
  canMutate(fence: ExecutionFence): boolean {
    const state = this.state();
    return !state.held && this.authorization(state, fence).ok;
  }
}

class TrustedFixture implements HandoffSupervisor, HandoffSuccessor {
  crashAt?: HandoffPhase | 'registered';
  constructor(readonly store: DiskStore) {}
  async quiesce(_source: ExecutionFence, _id: string): Promise<ControlResult<QuiescenceProof>> {
    const state = this.store.state();
    if (this.crashAt === 'quiescing') throw new Error('crash');
    // Deterministic fixture reports persisted counts; it does not kill real processes.
    return success({
      treeId: 'source-tree',
      supervisorId: 'trusted',
      observedAt: Date.now(),
      remainingProcesses: state.processes,
      pendingActions: state.pendingActions,
    });
  }
  async verify(fence: ExecutionFence, id: string, proof: QuiescenceProof): Promise<boolean> {
    const state = this.store.state();
    return (
      state.held &&
      state.record?.id === id &&
      fence.ownerId === 'old' &&
      proof.treeId === 'source-tree' &&
      proof.supervisorId === 'trusted' &&
      proof.observedAt <= Date.now() &&
      Date.now() - proof.observedAt < 60_000
    );
  }
  async ensureStarted(id: string, fence: ExecutionFence): Promise<ControlResult<void>> {
    const state = this.store.state();
    const authorized = this.store.authorization(state, fence);
    if (!authorized.ok) return authorized;
    if (!state.registrations[id]) {
      state.registrations[id] = fence;
      state.held = false;
      this.store.save(state);
    }
    if (this.crashAt === 'registered') throw new Error('crash');
    return success(undefined);
  }
}

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'orvilo-handoff-'));
  directories.push(directory);
  const store = new DiskStore(join(directory, 'control.json'));
  store.save({
    fence: source,
    held: false,
    revoked: false,
    expiresAt: Date.now() + 120_000,
    registrations: {},
    processes: 0,
    pendingActions: 0,
  });
  const adapters = new TrustedFixture(store);
  return { store, adapters, coordinator: new HandoffCoordinator(store, adapters, adapters) };
}

describe('durable handoff coordinator (protocol fixture, no runtime integration claim)', () => {
  it.each(['prepared', 'quiescing', 'quiescent', 'transferred', 'resumed'] as const)(
    'recovers a disk-persisted %s phase without a second writer',
    async (phase) => {
      const { store, coordinator } = fixture();
      const result = await coordinator.begin('handoff', source, 'new');
      expect(result.ok).toBe(true);
      const state = store.state();
      state.record!.phase = phase;
      state.record!.quiescence = {
        treeId: 'source-tree',
        supervisorId: 'trusted',
        observedAt: Date.now(),
        remainingProcesses: 0,
        pendingActions: 0,
      };
      if (phase === 'transferred' || phase === 'resumed') {
        state.fence = { ...source, ownerId: 'new', leaseId: 'lease-2', epoch: 2 };
        state.record!.successor = state.fence;
      }
      if (phase === 'resumed') {
        state.registrations.handoff = state.fence;
        state.held = false;
      }
      store.save(state);
      const reopened = new DiskStore(store.file);
      const adapters = new TrustedFixture(reopened);
      const recovered = await new HandoffCoordinator(reopened, adapters, adapters).recover(
        'handoff',
      );
      expect(recovered.ok && recovered.value.phase).toBe('resumed');
      expect(Object.keys(reopened.state().registrations)).toEqual(['handoff']);
      expect(reopened.canMutate(source)).toBe(false);
      expect(reopened.canMutate(reopened.state().fence)).toBe(true);
    },
  );

  it('survives a crash after successor registration before recording resumed', async () => {
    const { store, adapters, coordinator } = fixture();
    await coordinator.begin('handoff', source, 'new');
    adapters.crashAt = 'registered';
    await expect(coordinator.recover('handoff')).rejects.toThrow('crash');
    expect(store.state().record?.phase).toBe('transferred');
    const reopened = new DiskStore(store.file);
    const successor = new TrustedFixture(reopened);
    expect(
      (await new HandoffCoordinator(reopened, successor, successor).recover('handoff')).ok,
    ).toBe(true);
    expect(Object.keys(reopened.state().registrations)).toEqual(['handoff']);
  });

  it('holds source admission without clearing its owner and rejects concurrent handoffs', async () => {
    const { store, coordinator } = fixture();
    const results = await Promise.all([
      coordinator.begin('a', source, 'new'),
      coordinator.begin('b', source, 'other'),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(store.state().fence.ownerId).toBe('old');
    expect(store.canMutate(source)).toBe(false);
    expect((await coordinator.begin('a', source, 'new')).ok).toBe(true);
  });

  it.each(['revoked', 'lease_expired', 'stale_fence'] as const)(
    'rechecks %s at transfer',
    async (code) => {
      const { store, coordinator } = fixture();
      await coordinator.begin('handoff', source, 'new');
      const state = store.state();
      if (code === 'revoked') state.revoked = true;
      if (code === 'lease_expired') state.expiresAt = 0;
      if (code === 'stale_fence') state.fence.epoch++;
      store.save(state);
      const result = await coordinator.recover('handoff');
      expect(!result.ok && result.error.code).toBe(code);
      expect(store.state().fence.ownerId).toBe('old');
      expect(store.state().registrations).toEqual({});
    },
  );

  it.each(['processes', 'pendingActions'] as const)(
    'requires zero %s before transferring',
    async (field) => {
      const { store, coordinator } = fixture();
      await coordinator.begin('handoff', source, 'new');
      const state = store.state();
      state[field] = 1;
      store.save(state);
      const result = await coordinator.recover('handoff');
      expect(!result.ok && result.error.code).toBe('not_quiescent');
      expect(store.state().fence.ownerId).toBe('old');
    },
  );
});

import { describe, expect, it } from 'vitest';

import type { ExecutionFence, HandoffRecord } from './contracts';
import { HandoffCoordinator } from './handoff';

const source: ExecutionFence = {
  tenantId: 'tenant',
  principalId: 'principal',
  taskId: 'task',
  grantId: 'grant',
  ownerId: 'source',
  leaseId: 'lease',
  epoch: 1,
  policyRevision: 1,
  stateRevision: 1,
};
const prepared = (): HandoffRecord => ({
  schemaVersion: 1,
  id: 'handoff',
  taskId: 'task',
  source: { ...source },
  successorOwnerId: 'successor',
  phase: 'quiescent',
  revision: 2,
  quiescence: {
    treeId: 'tree',
    supervisorId: 'supervisor',
    observedAt: 1,
    remainingProcesses: 0,
    pendingActions: 0,
  },
});

// These tests cover coordinator validation, not production persistence or OS isolation.
describe('handoff transfer identity', () => {
  it.each(['id', 'tenant', 'owner', 'revision'])(
    'rejects a transfer which rewrites %s',
    async (field) => {
      const initial = prepared();
      const transferred: HandoffRecord = {
        ...initial,
        phase: 'transferred',
        revision: 3,
        successor: { ...source, ownerId: 'successor', leaseId: 'next-lease', epoch: 2 },
      };
      if (field === 'id') transferred.id = 'different';
      if (field === 'tenant') {
        transferred.source = { ...source, tenantId: 'foreign' };
        transferred.successor!.tenantId = 'foreign';
      }
      if (field === 'owner') {
        transferred.successorOwnerId = 'foreign';
        transferred.successor!.ownerId = 'foreign';
      }
      if (field === 'revision') transferred.revision = initial.revision;
      let starts = 0;
      const coordinator = new HandoffCoordinator(
        {
          async begin() {
            return { ok: true, value: initial };
          },
          async read() {
            return initial;
          },
          async compareAndSet() {
            return true;
          },
          async transfer() {
            return { ok: true, value: transferred };
          },
        },
        {
          async quiesce() {
            return { ok: true, value: initial.quiescence! };
          },
          async verify() {
            return true;
          },
        },
        {
          async ensureStarted() {
            starts++;
            return { ok: true, value: undefined };
          },
        },
      );
      expect(await coordinator.recover('handoff')).toMatchObject({
        ok: false,
        error: { code: 'handoff_conflict' },
      });
      expect(starts).toBe(0);
    },
  );
});

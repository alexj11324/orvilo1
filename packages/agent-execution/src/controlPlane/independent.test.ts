import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { ActionExecutor, AuthoritySnapshot } from './actionGateway';
import { createActionGateway, FileDurableReceiptStore } from './actionGateway';
import type { ActionRequest, DurableReceipt, ExecutionFence, HandoffRecord } from './contracts';
import type { HandoffPersistence } from './handoff';
import { HandoffCoordinator } from './handoff';
import { sanitizedRuntimeEnvironment, unavailableProcessTreeSupervisor } from './isolation';
import type { AuthoritativeVerification } from './verification';
import { validateCompletion } from './verification';

// Boundary fixtures exercise gateway decisions, not an OS sandbox or a production authority DB.
const fence: ExecutionFence = {
  tenantId: 'tenant',
  principalId: 'principal',
  taskId: 'task',
  grantId: 'grant',
  ownerId: 'owner',
  leaseId: 'lease',
  epoch: 4,
  policyRevision: 2,
  stateRevision: 3,
};
const request = (): ActionRequest => ({
  schemaVersion: 1,
  fence: { ...fence },
  idempotencyKey: 'key',
  commitmentId: 'commitment',
  action: { kind: 'file.write', path: '/workspace/result', content: 'result' },
});
const snapshot = (): AuthoritySnapshot => ({
  fence: { ...fence },
  grant: { expiresAt: 200, revoked: false, permittedKinds: ['file.write'] },
  leaseExpiresAt: 200,
  mutationEnabled: true,
  isolation: {
    supervisorId: 'supervisor',
    treeId: 'tree',
    enforced: true,
    filesystem: true,
    network: true,
    processes: true,
    sanitizedEnvironment: true,
    credentialsExcluded: true,
  },
  commitment: {
    id: 'commitment',
    taskId: 'task',
    actionKinds: ['file.write'],
    postconditions: [{ verifierId: 'digest', expected: 'result-digest' }],
  },
});
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function fixture() {
  const directory = await mkdtemp(path.join(tmpdir(), 'orvilo-independent-receipts-'));
  directories.push(directory);
  let authority = snapshot();
  let applied = 0;
  let interrupted = false;
  let scopeAllowed = true;
  const executor: ActionExecutor = {
    async authorize() {
      return scopeAllowed
        ? { ok: true, value: true }
        : {
            ok: false,
            error: {
              code: 'policy_denied',
              message: 'Target outside trusted scope',
              retryable: false,
            },
          };
    },
    async apply() {
      applied++;
      if (interrupted) throw new Error('lost acknowledgement');
      return { evidence: ['applied'] };
    },
    async verify() {
      return { passed: true, evidence: ['verified'] };
    },
  };
  const gateway = () =>
    createActionGateway({
      authority: {
        async withAdmission(_request, run) {
          return run(authority);
        },
      },
      executor,
      receipts: new FileDurableReceiptStore(directory),
      now: () => 100,
    });
  return {
    gateway,
    applied: () => applied,
    setAuthority(value: AuthoritySnapshot) {
      authority = value;
    },
    interrupt() {
      interrupted = true;
    },
    denyScope() {
      scopeAllowed = false;
    },
  };
}

describe('independent action admission and durable replay regressions', () => {
  it.each([
    [
      'revoked',
      (value: AuthoritySnapshot) => {
        value.grant.revoked = true;
      },
      'revoked',
    ],
    [
      'expired lease',
      (value: AuthoritySnapshot) => {
        value.leaseExpiresAt = 100;
      },
      'lease_expired',
    ],
    [
      'old epoch',
      (value: AuthoritySnapshot) => {
        value.fence.epoch++;
      },
      'stale_fence',
    ],
    [
      'changed policy',
      (value: AuthoritySnapshot) => {
        value.fence.policyRevision++;
      },
      'stale_fence',
    ],
    [
      'disabled mutation',
      (value: AuthoritySnapshot) => {
        value.mutationEnabled = false;
      },
      'policy_denied',
    ],
    [
      'missing tree isolation',
      (value: AuthoritySnapshot) => {
        value.isolation.processes = false;
      },
      'isolation_unavailable',
    ],
    [
      'foreign commitment',
      (value: AuthoritySnapshot) => {
        value.commitment.taskId = 'other';
      },
      'policy_denied',
    ],
  ] as const)('rejects %s before effects', async (_name, change, code) => {
    const setup = await fixture();
    const value = snapshot();
    change(value);
    setup.setAuthority(value);
    expect(await setup.gateway().execute(request())).toMatchObject({ ok: false, error: { code } });
    expect(setup.applied()).toBe(0);
  });

  it('rechecks revocation even when a durable verified receipt exists', async () => {
    const setup = await fixture();
    expect((await setup.gateway().execute(request())).ok).toBe(true);
    const value = snapshot();
    value.grant.revoked = true;
    setup.setAuthority(value);
    expect(await setup.gateway().execute(request())).toMatchObject({
      ok: false,
      error: { code: 'revoked' },
    });
    expect(setup.applied()).toBe(1);
  });

  it('reads an existing receipt with a new disk adapter without reapplying', async () => {
    const setup = await fixture();
    const first = await setup.gateway().execute(request());
    const recovered = await setup.gateway().execute(request());
    expect(recovered).toEqual(first);
    expect(setup.applied()).toBe(1);
  });

  it('denies a changed payload using an already reserved idempotency key', async () => {
    const setup = await fixture();
    await setup.gateway().execute(request());
    const changed = request();
    changed.action = { kind: 'file.write', path: '/workspace/result', content: 'changed' };
    expect(await setup.gateway().execute(changed)).toMatchObject({
      ok: false,
      error: { code: 'idempotency_conflict' },
    });
    expect(setup.applied()).toBe(1);
  });

  it('keeps ambiguous effects blocked across disk-adapter recreation', async () => {
    const setup = await fixture();
    setup.interrupt();
    expect(await setup.gateway().execute(request())).toMatchObject({
      ok: false,
      error: { code: 'outcome_unknown' },
    });
    expect(await setup.gateway().execute(request())).toMatchObject({
      ok: false,
      error: { code: 'outcome_unknown' },
    });
    expect(setup.applied()).toBe(1);
  });

  it('rejects an invalid file action instead of calling the executor', async () => {
    const setup = await fixture();
    const malformed = {
      ...request(),
      action: { kind: 'file.write', path: undefined, content: 17 },
    } as unknown as ActionRequest;
    expect(await setup.gateway().execute(malformed)).toMatchObject({
      ok: false,
      error: { code: 'invalid_request' },
    });
    expect(setup.applied()).toBe(0);
  });

  it('honors trusted target-scope denial before effects', async () => {
    const setup = await fixture();
    setup.denyScope();
    const outside = request();
    outside.action = { kind: 'file.write', path: '/private/controlDB', content: 'attempt' };
    expect(await setup.gateway().execute(outside)).toMatchObject({
      ok: false,
      error: { code: 'policy_denied' },
    });
    expect(setup.applied()).toBe(0);
  });
});

describe('independent handoff safety boundaries', () => {
  const record = (): HandoffRecord => ({
    schemaVersion: 1,
    id: 'handoff',
    taskId: 'task',
    source: { ...fence },
    successorOwnerId: 'next',
    phase: 'transferred',
    revision: 3,
    quiescence: {
      treeId: 'tree',
      supervisorId: 'supervisor',
      observedAt: 100,
      remainingProcesses: 0,
      pendingActions: 0,
    },
    successor: { ...fence, ownerId: 'next', leaseId: 'next-lease', epoch: 5 },
  });

  it.each(['tenantId', 'taskId', 'ownerId', 'epoch', 'leaseId'] as const)(
    'rejects a recovered transferred fence with invalid %s',
    async (field) => {
      const value = record();
      Object.assign(value.successor!, {
        [field]: field === 'epoch' ? fence.epoch : field === 'leaseId' ? fence.leaseId : 'foreign',
      });
      let launched = 0;
      const store: HandoffPersistence = {
        async begin() {
          return { ok: true, value };
        },
        async read() {
          return value;
        },
        async compareAndSet() {
          return true;
        },
        async transfer() {
          return { ok: true, value };
        },
      };
      const coordinator = new HandoffCoordinator(
        store,
        {
          async quiesce() {
            return { ok: true, value: value.quiescence! };
          },
          async verify() {
            return true;
          },
        },
        {
          async ensureStarted() {
            launched++;
            return { ok: true, value: undefined };
          },
        },
      );
      expect(await coordinator.recover('handoff')).toMatchObject({
        ok: false,
        error: { code: 'handoff_conflict' },
      });
      expect(launched).toBe(0);
    },
  );
});

describe('independent completion authority', () => {
  const receipt: DurableReceipt = {
    schemaVersion: 1,
    id: 'receipt',
    requestDigest: 'digest',
    idempotencyKey: 'key',
    fence,
    commitmentId: 'commitment',
    actionKind: 'file.write',
    status: 'verified',
    createdAt: 1,
    updatedAt: 2,
    evidence: ['proof'],
  };
  const verification = (): AuthoritativeVerification => ({
    fence,
    acceptedDecision: { id: 'decision', taskId: 'task', accepted: true },
    rejectedTombstoneIds: [],
    dependencies: [{ taskId: 'dependency', acceptanceId: 'dependency-acceptance', accepted: true }],
    commitments: [snapshot().commitment],
    receipts: [{ ...receipt }],
    postconditionsVerified: [
      { receiptId: 'receipt', verifierId: 'digest', expected: 'result-digest' },
    ],
  });
  const evidence = {
    taskId: 'task',
    fence,
    acceptedDecisionId: 'decision',
    commitmentIds: ['commitment'],
    receiptIds: ['receipt'],
    dependencyAcceptanceIds: ['dependency-acceptance'],
  };

  it.each(['decision', 'commitment', 'receipt', 'dependency-acceptance'])(
    'rejects tombstoned %s',
    (id) => {
      const value = verification();
      value.rejectedTombstoneIds.push(id);
      expect(validateCompletion(evidence, value)).toMatchObject({
        ok: false,
        error: { code: 'verification_required' },
      });
    },
  );
  it('rejects a dependency that has not been accepted', () => {
    const value = verification();
    value.dependencies[0].accepted = false;
    expect(validateCompletion(evidence, value).ok).toBe(false);
  });
  it('rejects applied effects without verified postconditions', () => {
    const value = verification();
    value.receipts[0].status = 'applied';
    expect(validateCompletion(evidence, value).ok).toBe(false);
  });
});

describe('portable isolation default', () => {
  it('does not expose ambient credentials through the environment constructor', () => {
    expect(sanitizedRuntimeEnvironment({ home: '/runtime/home', temp: '/runtime/tmp' })).toEqual({
      HOME: '/runtime/home',
      TMPDIR: '/runtime/tmp',
      LANG: 'en_US.UTF-8',
      PYTHONNOUSERSITE: '1',
    });
  });
  it('denies launch without an approved process-tree supervisor', async () => {
    expect(
      await unavailableProcessTreeSupervisor.launch({
        executable: '/prime',
        args: [],
        workspace: '/workspace',
        environment: {},
      }),
    ).toMatchObject({ ok: false, error: { code: 'isolation_unavailable' } });
  });
});

import { expect, it } from 'vitest';

import type { ExecutionFence, VerificationEvidence } from './contracts';
import type { AuthoritativeVerification } from './verification';
import { validateCompletion } from './verification';

// Validator-only regression. Canonical Verify settlement still owns final task completion.
it('refuses completion when the dependency task itself is tombstoned', () => {
  const fence: ExecutionFence = {
    tenantId: 'tenant',
    principalId: 'principal',
    taskId: 'task',
    grantId: 'grant',
    ownerId: 'owner',
    leaseId: 'lease',
    epoch: 1,
    policyRevision: 1,
    stateRevision: 1,
  };
  const evidence: VerificationEvidence = {
    taskId: 'task',
    fence,
    acceptedDecisionId: 'decision',
    commitmentIds: ['commitment'],
    receiptIds: ['receipt'],
    dependencyAcceptanceIds: ['accepted-dependency'],
  };
  const snapshot: AuthoritativeVerification = {
    fence,
    acceptedDecision: { id: 'decision', taskId: 'task', accepted: true },
    dependencies: [{ taskId: 'dependency', acceptanceId: 'accepted-dependency', accepted: true }],
    rejectedTombstoneIds: ['dependency'],
    commitments: [
      {
        id: 'commitment',
        taskId: 'task',
        actionKinds: ['file.write'],
        postconditions: [{ verifierId: 'digest', expected: 'hash' }],
      },
    ],
    receipts: [
      {
        schemaVersion: 1,
        id: 'receipt',
        fence,
        commitmentId: 'commitment',
        actionKind: 'file.write',
        status: 'verified',
        evidence: ['proof'],
        requestDigest: 'digest',
        idempotencyKey: 'key',
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    postconditionsVerified: [{ receiptId: 'receipt', verifierId: 'digest', expected: 'hash' }],
  };
  expect(validateCompletion(evidence, snapshot)).toMatchObject({
    ok: false,
    error: { code: 'verification_required' },
  });
  snapshot.rejectedTombstoneIds = [];
  expect(validateCompletion(evidence, snapshot)).toEqual({ ok: true, value: undefined });
});

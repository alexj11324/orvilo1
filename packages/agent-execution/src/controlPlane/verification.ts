import type {
  Commitment,
  ControlResult,
  DurableReceipt,
  ExecutionFence,
  VerificationEvidence,
} from './contracts';
import { CONTROL_PLANE_VERSION } from './contracts';

/** Loaded by Orvilo, never provided by the runtime requesting completion. */
export interface AuthoritativeVerification {
  acceptedDecision: { id: string; taskId: string; accepted: boolean } | undefined;
  commitments: Commitment[];
  dependencies: { taskId: string; acceptanceId: string | undefined; accepted: boolean }[];
  fence: ExecutionFence;
  /** Trusted verifier binds a receipt to all required postconditions. */
  postconditionsVerified: { receiptId: string; verifierId: string; expected: string }[];
  receipts: DurableReceipt[];
  rejectedTombstoneIds: string[];
}

export interface CompletionPersistence {
  /** One DB transaction: reauthorize current fence/lease/policy, load authoritative snapshot,
   * invoke validate, and mark final done only if validation succeeds and revisions still match.
   * Tombstones, dependencies, decisions and receipts must be read at this same snapshot. */
  verifyAndComplete: (
    evidence: VerificationEvidence,
    validate: (snapshot: AuthoritativeVerification) => ControlResult<void>,
  ) => Promise<ControlResult<void>>;
}

const fail = (message: string): ControlResult<void> => ({
  ok: false,
  error: { code: 'verification_required', message, retryable: false },
});

const sameFence = (a: ExecutionFence, b: ExecutionFence): boolean =>
  (Object.keys(a) as (keyof ExecutionFence)[]).every((key) => a[key] === b[key]) &&
  (Object.keys(b) as (keyof ExecutionFence)[]).every((key) => a[key] === b[key]);

export function validateCompletion(
  evidence: VerificationEvidence,
  snapshot: AuthoritativeVerification,
): ControlResult<void> {
  if (evidence.taskId !== snapshot.fence.taskId || !sameFence(evidence.fence, snapshot.fence)) {
    return fail('Completion fence is stale or belongs to another task.');
  }
  const decision = snapshot.acceptedDecision;
  if (
    snapshot.rejectedTombstoneIds.includes(evidence.taskId) ||
    !decision?.accepted ||
    decision.taskId !== evidence.taskId ||
    decision.id !== evidence.acceptedDecisionId ||
    snapshot.rejectedTombstoneIds.includes(decision.id)
  ) {
    return fail('An authoritative accepted decision without a rejection tombstone is required.');
  }
  if (
    snapshot.dependencies.some(
      (dependency) =>
        !dependency.accepted ||
        !dependency.acceptanceId ||
        !evidence.dependencyAcceptanceIds.includes(dependency.acceptanceId) ||
        snapshot.rejectedTombstoneIds.includes(dependency.taskId) ||
        snapshot.rejectedTombstoneIds.includes(dependency.acceptanceId),
    )
  ) {
    return fail('Every authoritative prerequisite requires a current accepted decision.');
  }
  if (
    !snapshot.commitments.length ||
    snapshot.commitments.some(
      (commitment) =>
        commitment.taskId !== evidence.taskId ||
        !evidence.commitmentIds.includes(commitment.id) ||
        !commitment.postconditions.length ||
        !commitment.actionKinds.length ||
        snapshot.rejectedTombstoneIds.includes(commitment.id),
    )
  ) {
    return fail('All authoritative commitments and postconditions must be supplied.');
  }
  for (const commitment of snapshot.commitments) {
    const receipts = snapshot.receipts.filter(
      (receipt) =>
        evidence.receiptIds.includes(receipt.id) &&
        receipt.schemaVersion === CONTROL_PLANE_VERSION &&
        receipt.status === 'verified' &&
        receipt.commitmentId === commitment.id &&
        sameFence(receipt.fence, snapshot.fence) &&
        receipt.evidence.length > 0 &&
        receipt.requestDigest.length > 0 &&
        receipt.idempotencyKey.length > 0 &&
        !snapshot.rejectedTombstoneIds.includes(receipt.id),
    );
    if (
      commitment.actionKinds.some(
        (kind) => !receipts.some((receipt) => receipt.actionKind === kind),
      ) ||
      commitment.postconditions.some(
        (condition) =>
          !receipts.some((receipt) =>
            snapshot.postconditionsVerified.some(
              (verified) =>
                verified.receiptId === receipt.id &&
                verified.verifierId === condition.verifierId &&
                verified.expected === condition.expected,
            ),
          ),
      )
    ) {
      return fail('Every commitment requires durable verified action receipts and postconditions.');
    }
  }
  return { ok: true, value: undefined };
}

/** No RuntimeEvent/turn-ended input is accepted as completion authority. */
export const completeVerifiedTask = (
  persistence: CompletionPersistence,
  evidence: VerificationEvidence,
): Promise<ControlResult<void>> =>
  persistence.verifyAndComplete(evidence, (snapshot) => validateCompletion(evidence, snapshot));

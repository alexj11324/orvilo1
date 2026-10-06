import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename } from 'node:fs/promises';
import path from 'node:path';

import { isPlainRecord } from '@orvilo/utils/object';

import type {
  ActionGateway,
  ActionRequest,
  Commitment,
  ControlErrorCode,
  ControlResult,
  DurableReceipt,
  ExecutionFence,
  IsolationEvidence,
  TypedAction,
} from './contracts';
import { CONTROL_PLANE_VERSION } from './contracts';

export interface AuthoritySnapshot {
  commitment: Commitment;
  fence: ExecutionFence;
  grant: { expiresAt: number; revoked: boolean; permittedKinds: TypedAction['kind'][] };
  isolation: IsolationEvidence;
  leaseExpiresAt: number;
  mutationEnabled: boolean;
}

/** Trusted control-plane implementation must serialize this scope with revocation,
 * handoff and policy/state updates. Executors must fence external writes atomically;
 * this callback is not a substitute for conditional writes at an external target. */
export interface ActionAuthority {
  withAdmission: <T>(
    request: ActionRequest,
    run: (snapshot: AuthoritySnapshot) => Promise<T>,
  ) => Promise<T>;
}

/** Trusted implementation only. This module supplies no concrete mutation executor.
 * Implementations must constrain paths after resolving symlinks, enforce tenant/task
 * resource scopes and network destination policy, and perform epoch/lease conditional
 * writes at the actual target. They must not accept shell commands or agent verifiers.
 * Deploy/issue connectors require separately authorized credentials in this boundary. */
export interface ActionExecutor {
  apply: (request: ActionRequest) => Promise<{ evidence: string[] }>;
  /** Read-only scope/target admission, run inside the authority serialization scope.
   * Resolve concrete file/repository/issue/deploy resource and network permissions;
   * denied or unavailable scope information must return policy_denied. */
  authorize: (request: ActionRequest, snapshot: AuthoritySnapshot) => Promise<ControlResult<true>>;
  verify: (
    request: ActionRequest,
    commitment: Commitment,
  ) => Promise<{ passed: boolean; evidence: string[] }>;
}

export interface DurableReceiptStore {
  /** Atomically reserve a namespaced key, durably persist prepared before returning claimed. */
  reserve: (
    key: string,
    receipt: DurableReceipt,
  ) => Promise<{ claimed: boolean; receipt: DurableReceipt }>;
  /** Durably replace the claimed receipt. Only the original reservation owner may call this. */
  save: (key: string, receipt: DurableReceipt) => Promise<void>;
}

const failure = (code: ControlErrorCode, message: string): ControlResult<never> => ({
  ok: false,
  error: { code, message, retryable: false },
});
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
};
const keyOf = (request: ActionRequest) =>
  hash(
    canonical([
      request.fence.tenantId,
      request.fence.principalId,
      request.fence.taskId,
      request.idempotencyKey,
    ]),
  );

const nonempty = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;
const revision = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

/** RPC/JSON boundaries must validate runtime values despite the TypeScript signature. */
function validRequestShape(value: unknown): value is ActionRequest {
  if (
    !isPlainRecord(value) ||
    !isPlainRecord(value.fence) ||
    !isPlainRecord(value.action) ||
    !nonempty(value.idempotencyKey) ||
    !nonempty(value.commitmentId)
  )
    return false;
  const fence = value.fence;
  if (
    !['tenantId', 'principalId', 'taskId', 'grantId', 'ownerId', 'leaseId'].every((key) =>
      nonempty(fence[key]),
    ) ||
    !['epoch', 'policyRevision', 'stateRevision'].every((key) => revision(fence[key]))
  )
    return false;
  const action = value.action;
  switch (action.kind) {
    case 'file.write': {
      return nonempty(action.path) && typeof action.content === 'string';
    }
    case 'git.commit': {
      return (
        nonempty(action.repository) && nonempty(action.message) && nonempty(action.expectedHead)
      );
    }
    case 'task.transition': {
      return (
        nonempty(action.taskId) &&
        revision(action.expectedRevision) &&
        (action.target === 'blocked' || action.target === 'review')
      );
    }
    case 'issue.update': {
      return (
        nonempty(action.provider) &&
        nonempty(action.issueId) &&
        isPlainRecord(action.patch) &&
        Object.values(action.patch).every((entry) => typeof entry === 'string')
      );
    }
    case 'deploy': {
      return nonempty(action.target) && nonempty(action.artifactDigest);
    }
    default: {
      return false;
    }
  }
}

function validate(
  request: ActionRequest,
  snapshot: AuthoritySnapshot,
  now: number,
): ControlResult<true> {
  if (request.schemaVersion !== CONTROL_PLANE_VERSION)
    return failure('unsupported_version', 'Unsupported action schema');
  if (
    !request.idempotencyKey ||
    !request.commitmentId ||
    !Number.isSafeInteger(request.fence.epoch) ||
    Object.values(request.fence).some((value) => typeof value === 'string' && !value)
  ) {
    return failure('invalid_request', 'Missing action identity or invalid epoch');
  }
  if (
    snapshot.grant.revoked ||
    !Number.isFinite(snapshot.grant.expiresAt) ||
    snapshot.grant.expiresAt <= now
  )
    return failure('revoked', 'Grant revoked or expired');
  if (!Number.isFinite(snapshot.leaseExpiresAt) || snapshot.leaseExpiresAt <= now)
    return failure('lease_expired', 'Owner lease expired');
  for (const field of [
    'tenantId',
    'principalId',
    'taskId',
    'grantId',
    'ownerId',
    'leaseId',
    'epoch',
    'policyRevision',
    'stateRevision',
  ] as const) {
    if (request.fence[field] !== snapshot.fence[field])
      return failure('stale_fence', `Mismatched ${field}`);
  }
  const isolation = snapshot.isolation;
  if (
    !isolation.enforced ||
    !isolation.filesystem ||
    !isolation.network ||
    !isolation.processes ||
    !isolation.sanitizedEnvironment ||
    !isolation.credentialsExcluded ||
    !isolation.treeId ||
    !isolation.supervisorId
  ) {
    return failure('isolation_unavailable', 'Verified process-tree isolation required');
  }
  if (!snapshot.mutationEnabled || !snapshot.grant.permittedKinds.includes(request.action.kind)) {
    return failure('policy_denied', 'Mutation is disabled or action kind denied');
  }
  const commitment = snapshot.commitment;
  if (
    commitment.id !== request.commitmentId ||
    commitment.taskId !== request.fence.taskId ||
    !commitment.actionKinds.includes(request.action.kind) ||
    commitment.postconditions.length === 0 ||
    commitment.postconditions.some((condition) => !condition.verifierId || !condition.expected)
  ) {
    return failure('policy_denied', 'Action requires an authorized commitment and postconditions');
  }
  if (
    request.action.kind === 'task.transition' &&
    (request.action.taskId !== request.fence.taskId ||
      request.action.expectedRevision !== request.fence.stateRevision ||
      !['blocked', 'review'].includes(request.action.target))
  )
    return failure('policy_denied', 'Invalid task transition');
  return { ok: true, value: true };
}

/** No executor is invoked until both authority admission and durable reservation succeed. */
export function createActionGateway(deps: {
  authority: ActionAuthority;
  executor: ActionExecutor;
  receipts: DurableReceiptStore;
  now?: () => number;
}): ActionGateway {
  const now = deps.now ?? Date.now;
  return {
    async execute(input) {
      // Snapshot caller-owned mutable data before crossing an asynchronous trust boundary.
      let request: ActionRequest;
      try {
        const copied: unknown = structuredClone(input);
        if (!isPlainRecord(copied))
          return failure('invalid_request', 'Action request must be a record');
        if (!validRequestShape(copied))
          return failure('invalid_request', 'Malformed action identity or payload');
        if (copied.schemaVersion !== CONTROL_PLANE_VERSION)
          return failure('unsupported_version', 'Unsupported action schema');
        request = copied;
      } catch {
        return failure('invalid_request', 'Action request must be cloneable data');
      }
      try {
        return await deps.authority.withAdmission(
          request,
          async (snapshot): Promise<ControlResult<DurableReceipt>> => {
            const admitted = validate(request, snapshot, now());
            if (admitted.ok === false) return admitted;
            const scoped = await deps.executor.authorize(request, snapshot);
            if (scoped.ok === false) return scoped;
            const timestamp = now();
            const key = keyOf(request);
            const receipt: DurableReceipt = {
              schemaVersion: CONTROL_PLANE_VERSION,
              id: randomUUID(),
              requestDigest: hash(canonical(request)),
              idempotencyKey: request.idempotencyKey,
              fence: request.fence,
              commitmentId: request.commitmentId,
              actionKind: request.action.kind,
              status: 'prepared',
              createdAt: timestamp,
              updatedAt: timestamp,
              evidence: [],
            };
            const reserved = await deps.receipts.reserve(key, receipt);
            if (!reserved.claimed) {
              const replayAdmission = validate(request, snapshot, now());
              if (replayAdmission.ok === false) return replayAdmission;
              if (reserved.receipt.requestDigest !== receipt.requestDigest)
                return failure('idempotency_conflict', 'Key already used by another request');
              if (reserved.receipt.status === 'verified')
                return { ok: true, value: reserved.receipt };
              if (reserved.receipt.status === 'failed')
                return {
                  ok: false,
                  error: reserved.receipt.error ?? {
                    code: 'postcondition_failed',
                    message: 'Previous verification failed',
                    retryable: false,
                  },
                };
              return failure(
                'outcome_unknown',
                'Prior action is incomplete; trusted reconciliation required',
              );
            }
            // Persistence can take time; fail closed if the lease/grant expired meanwhile.
            const rechecked = validate(request, snapshot, now());
            if (rechecked.ok === false) {
              receipt.status = 'failed';
              receipt.error = rechecked.error;
              receipt.updatedAt = now();
              await deps.receipts.save(key, receipt);
              return rechecked;
            }
            const rescoped = await deps.executor.authorize(request, snapshot);
            const finalAdmission =
              rescoped.ok === true ? validate(request, snapshot, now()) : rescoped;
            if (finalAdmission.ok === false) {
              receipt.status = 'failed';
              receipt.error = finalAdmission.error;
              receipt.updatedAt = now();
              await deps.receipts.save(key, receipt);
              return finalAdmission;
            }
            try {
              const applied = await deps.executor.apply(request);
              receipt.status = 'applied';
              receipt.evidence = applied.evidence;
              receipt.updatedAt = now();
              await deps.receipts.save(key, receipt);
              const verification = await deps.executor.verify(request, snapshot.commitment);
              const passed = verification.passed && verification.evidence.length > 0;
              receipt.evidence.push(...verification.evidence);
              receipt.status = passed ? 'verified' : 'failed';
              receipt.updatedAt = now();
              if (!passed)
                receipt.error = {
                  code: 'postcondition_failed',
                  message: 'Trusted postconditions failed',
                  retryable: false,
                };
              await deps.receipts.save(key, receipt);
              return passed ? { ok: true, value: receipt } : { ok: false, error: receipt.error! };
            } catch {
              receipt.status = 'outcome_unknown';
              receipt.updatedAt = now();
              receipt.error = {
                code: 'outcome_unknown',
                message: 'Action or receipt persistence interrupted; reconciliation required',
                retryable: false,
              };
              // If this write fails, durable prepared/applied still prevents replay.
              try {
                await deps.receipts.save(key, receipt);
              } catch {
                /* retained reservation remains fail closed */
              }
              return { ok: false, error: receipt.error };
            }
          },
        );
      } catch {
        return failure('runtime_failed', 'Trusted admission or receipt storage unavailable');
      }
    },
  };
}

/** Local durable adapter for a private control-plane directory outside runtime scope.
 * Its parent must already be provisioned durably by the trusted control plane.
 * This is single-host filesystem storage, not a distributed database transaction.
 * Reservation directories are never reclaimed automatically: a crash before the first
 * receipt write blocks that key until trusted reconciliation. No stale-lock takeover. */
/** Filesystem receipts intentionally have no recovery takeover capability: an
 * incomplete receipt remains blocked. Only a store implementing atomic durable
 * recovery ownership/CAS may be used by createActionReceiptRecovery. */
export class FileDurableReceiptStore implements DurableReceiptStore {
  private readonly owned = new Map<string, string>();
  constructor(private readonly directory: string) {}
  private location(key: string) {
    if (!/^[a-f0-9]{64}$/.test(key)) throw new Error('Invalid receipt key');
    return path.join(this.directory, key);
  }
  async reserve(key: string, receipt: DurableReceipt) {
    await mkdir(this.directory, { mode: 0o700 }).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'EEXIST') throw error;
    });
    await this.syncDirectory(path.dirname(this.directory));
    const location = this.location(key);
    try {
      await mkdir(location, { mode: 0o700 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const prior: DurableReceipt = JSON.parse(
        await readFile(path.join(location, 'receipt.json'), 'utf8'),
      );
      return { claimed: false, receipt: prior };
    }
    await this.syncDirectory(this.directory);
    this.owned.set(key, receipt.id);
    await this.save(key, receipt);
    return { claimed: true, receipt };
  }
  async save(key: string, receipt: DurableReceipt) {
    if (this.owned.get(key) !== receipt.id) throw new Error('Receipt reservation not owned');
    const location = this.location(key);
    const temporary = path.join(location, `${randomUUID()}.tmp`);
    const file = await open(temporary, 'wx', 0o600);
    try {
      await file.writeFile(JSON.stringify(receipt));
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, path.join(location, 'receipt.json'));
    await this.syncDirectory(location);
  }
  private async syncDirectory(directory: string) {
    const handle = await open(directory, 'r');
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  }
}

/** Trusted reconciliation only. This capability never grants mutation/reservation ownership. */
export interface RecoverableReceiptStore {
  claimRecovery: (key: string, expected: DurableReceipt) => Promise<string | undefined>;
  finishRecovery: (
    key: string,
    token: string,
    expected: DurableReceipt,
    verified: DurableReceipt,
  ) => Promise<boolean>;
  read: (key: string) => Promise<DurableReceipt | undefined>;
}

/** Same original request and current authority are required. Cross-epoch evidence
 * adoption is intentionally unsupported. A read-only postcondition cannot authorize replay. */
export function createActionReceiptRecovery(deps: {
  authority: ActionAuthority;
  /** Trusted supervisor must bind proof to this original receipt/fence and keep
   * the original writer stopped and its effects drained through reconciliation. */
  confirmQuiescent: (request: ActionRequest, receipt: DurableReceipt) => Promise<boolean>;
  verifier: Pick<ActionExecutor, 'authorize' | 'verify'>;
  receipts: RecoverableReceiptStore;
  now?: () => number;
}) {
  const now = deps.now ?? Date.now;
  return {
    async recover(input: ActionRequest): Promise<ControlResult<DurableReceipt>> {
      try {
        const request: unknown = structuredClone(input);
        if (!validRequestShape(request))
          return failure('invalid_request', 'Malformed recovery request');
        if (request.schemaVersion !== CONTROL_PLANE_VERSION)
          return failure('unsupported_version', 'Unsupported action schema');
        return await deps.authority.withAdmission(request, async (snapshot) => {
          const admitted = validate(request, snapshot, now());
          if (admitted.ok === false) return admitted;
          const scoped = await deps.verifier.authorize(request, snapshot);
          if (scoped.ok === false) return scoped;
          const key = keyOf(request);
          const receipt = await deps.receipts.read(key);
          const rechecked = validate(request, snapshot, now());
          if (rechecked.ok === false) return rechecked;
          if (!receipt) return failure('outcome_unknown', 'No durable receipt exists');
          if (
            receipt.requestDigest !== hash(canonical(request)) ||
            receipt.schemaVersion !== CONTROL_PLANE_VERSION ||
            canonical(receipt.fence) !== canonical(request.fence) ||
            receipt.commitmentId !== request.commitmentId ||
            receipt.idempotencyKey !== request.idempotencyKey ||
            receipt.actionKind !== request.action.kind
          ) {
            return failure('idempotency_conflict', 'Receipt does not match original action');
          }
          if (receipt.status === 'verified') return { ok: true as const, value: receipt };
          if (!['prepared', 'applied', 'outcome_unknown'].includes(receipt.status))
            return failure('outcome_unknown', 'Receipt cannot be reconciled');
          if (!(await deps.confirmQuiescent(request, receipt)))
            return failure('not_quiescent', 'Original writer and effects are not proven drained');
          const token = await deps.receipts.claimRecovery(key, receipt);
          if (!token) return failure('outcome_unknown', 'Receipt changed during recovery');
          // Rotating reservation ownership prevents late original persistence. The
          // authoritative admission lock must also drain any original target effect.
          const beforeVerify = validate(request, snapshot, now());
          if (beforeVerify.ok === false) return beforeVerify;
          const checked = await deps.verifier.verify(request, snapshot.commitment);
          const finalAdmission = validate(request, snapshot, now());
          if (finalAdmission.ok === false) return finalAdmission;
          if (
            !checked.passed ||
            !checked.evidence.length ||
            checked.evidence.some((item) => typeof item !== 'string' || !item.trim())
          )
            return failure('outcome_unknown', 'Read-only postconditions did not establish success');
          const verified: DurableReceipt = {
            ...receipt,
            status: 'verified',
            evidence: [...receipt.evidence, ...checked.evidence],
            updatedAt: Math.max(now(), receipt.updatedAt),
          };
          delete verified.error;
          if (!(await deps.receipts.finishRecovery(key, token, receipt, verified)))
            return failure('outcome_unknown', 'Recovery ownership changed');
          return { ok: true as const, value: verified };
        });
      } catch {
        return failure('outcome_unknown', 'Trusted receipt reconciliation unavailable');
      }
    },
  };
}

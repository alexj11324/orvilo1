import { z } from 'zod';

/**
 * Frozen cross-domain command contract for the workspace/team model
 * (linear-workspace-v3). Every domain command — Team/Project/Issue ownership,
 * Linear import and publication, repository association, replanning and
 * dispatch — is invoked with one CommandContext so authorization, idempotency
 * and causality are checked the same way at every boundary.
 *
 * The zod schemas are the runtime half of the contract: routers validate
 * client input with them and services validate cross-module payloads before
 * acting on them.
 */

// ── Principals and command context ─────────────────────────────────────────

/** Who is executing a domain command. */
export type CommandPrincipalKind = 'agent' | 'integration' | 'system' | 'user';

export const commandPrincipalKindSchema = z.enum(['agent', 'integration', 'system', 'user']);

export interface CommandPrincipal {
  /** User id, agent id, installation/service id, or system worker id. */
  id: string;
  kind: CommandPrincipalKind;
}

export const commandPrincipalSchema = z.object({
  id: z.string().min(1),
  kind: commandPrincipalKindSchema,
});

/**
 * Server-established invocation context. `workspaceId` is always resolved
 * from the authenticated context — never accepted from client payloads.
 */
export interface CommandContext {
  /** Monotonic version of the authorization basis this command was checked against. */
  authorizationRevision: number;
  /** Optional upstream cause when the command was triggered by another command/event. */
  causationId?: string;
  /** Correlates logs, receipts and downstream events for this invocation. */
  correlationId: string;
  /** Client/worker supplied dedupe key; replays return the recorded receipt. */
  idempotencyKey: string;
  principal: CommandPrincipal;
  workspaceId: string;
}

export const commandContextSchema = z.object({
  authorizationRevision: z.number().int().min(0),
  causationId: z.string().min(1).optional(),
  correlationId: z.string().min(1),
  idempotencyKey: z.string().min(1).max(255),
  principal: commandPrincipalSchema,
  workspaceId: z.string().min(1),
});

// ── Planning scopes ────────────────────────────────────────────────────────

/**
 * A planning scope independent of the event source. Linear sync, local edits
 * and automation all wake planners through the same scope reference; a scope
 * does not require Linear to be installed.
 */
export type PlanningScopeRef =
  | { id: string; kind: 'goal' }
  | { id: string; kind: 'project' }
  | { id: string; kind: 'team' }
  | { id: string; kind: 'workspace' };

export const planningScopeRefSchema = z.discriminatedUnion('kind', [
  z.object({ id: z.string().min(1), kind: z.literal('goal') }),
  z.object({ id: z.string().min(1), kind: z.literal('project') }),
  z.object({ id: z.string().min(1), kind: z.literal('team') }),
  z.object({ id: z.string().min(1), kind: z.literal('workspace') }),
]);

// ── Error codes ────────────────────────────────────────────────────────────

/**
 * Structured domain error codes. The frontend switches on `code`, never on
 * English message text.
 */
export const DOMAIN_ERROR_CODES = [
  'DEPENDENCY_BLOCKED',
  'FORBIDDEN_SCOPE',
  'IDENTITY_CONFLICT',
  'OUTCOME_UNKNOWN',
  'PUBLICATION_NOT_APPROVED',
  'RESOURCE_UNRESOLVED',
  'STOP_UNCONFIRMED',
  'STALE_REVISION',
  'SYNC_PENDING',
] as const;

export type DomainErrorCode = (typeof DOMAIN_ERROR_CODES)[number];

export const domainErrorCodeSchema = z.enum(DOMAIN_ERROR_CODES);

/** Wire shape carried over TRPC error causes and worker receipts. */
export interface DomainErrorBody {
  code: DomainErrorCode;
  /** Extra machine-readable context (e.g. conflicting ids, required scope). */
  details?: Record<string, unknown>;
  message: string;
  /** Whether retrying the identical command can succeed without user action. */
  retryable?: boolean;
}

export const domainErrorBodySchema = z.object({
  code: domainErrorCodeSchema,
  details: z.record(z.string(), z.unknown()).optional(),
  message: z.string().min(1),
  retryable: z.boolean().optional(),
});

/** Throw-side companion of {@link DomainErrorBody}; serializes to the body shape. */
export class DomainError extends Error {
  readonly body: DomainErrorBody;
  readonly code: DomainErrorCode;
  readonly details?: Record<string, unknown>;
  readonly retryable: boolean;

  constructor(
    code: DomainErrorCode,
    message: string,
    body?: Omit<DomainErrorBody, 'code' | 'message'>,
  ) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.details = body?.details;
    this.retryable = body?.retryable ?? false;
    this.body = {
      code,
      ...(body?.details ? { details: body.details } : {}),
      message,
      ...(body?.retryable !== undefined ? { retryable: body.retryable } : {}),
    };
  }
}

export const isDomainError = (value: unknown): value is DomainError => value instanceof DomainError;

// ── Execution target ───────────────────────────────────────────────────────

/** Where a run executes: an authorized device checkout, or a remote sandbox. */
export type ExecutionEnvironmentRef =
  | { checkoutId: string; deviceId: string; kind: 'device' }
  | { kind: 'sandbox'; providerId: string };

export const executionEnvironmentRefSchema = z.discriminatedUnion('kind', [
  z.object({
    checkoutId: z.string().min(1),
    deviceId: z.string().min(1),
    kind: z.literal('device'),
  }),
  z.object({ kind: z.literal('sandbox'), providerId: z.string().min(1) }),
]);

/**
 * The frozen run contract captured at dispatch time. Once frozen, every
 * revision/SHA/fence inside is what this generation of the task is allowed to
 * see — a later requirement, policy or base change starts a new generation.
 *
 * `targetBaseSha` and `checkoutStartSha` are deliberately separate fields:
 * a fix attempt checks out from the PR's current head while the merge gate
 * still validates against the latest observed target base.
 */
export interface ResolvedExecutionTarget {
  /** Repo-relative paths the writer may touch; empty array means read-only. */
  allowedWritePaths: string[];
  /** Authorization basis version frozen into this run. */
  authorizationRevision: number;
  /** Commit this attempt starts from: target base for a first run, the PR head for a fix. */
  checkoutStartSha: string;
  environment: ExecutionEnvironmentRef;
  /** Task execution generation this target is bound to. */
  generation: number;
  /** Execution grant id that authorized the write scope. */
  grantId: string;
  policyRevision: number;
  /** Stable provider host identity, e.g. `github.com`. */
  providerHost: string;
  /** Provider's stable repository id when the remote was verified. */
  remoteRepositoryId?: string;
  /** Local repositories row id. */
  repositoryId: string;
  requirementRevision: number;
  /** Ref the delivery merges into, e.g. `canary`. */
  targetBaseRef: string;
  /** The observed commit of the target base at resolve time. */
  targetBaseSha: string;
  taskRevision: number;
}

export const resolvedExecutionTargetSchema = z.object({
  allowedWritePaths: z.array(z.string()),
  authorizationRevision: z.number().int().min(0),
  checkoutStartSha: z.string().min(1),
  environment: executionEnvironmentRefSchema,
  generation: z.number().int().min(0),
  grantId: z.string().min(1),
  policyRevision: z.number().int().min(1),
  providerHost: z.string().min(1),
  remoteRepositoryId: z.string().min(1).optional(),
  repositoryId: z.string().min(1),
  requirementRevision: z.number().int().min(1),
  targetBaseRef: z.string().min(1),
  targetBaseSha: z.string().min(1),
  taskRevision: z.number().int().min(1),
});

// ── Delivery context ───────────────────────────────────────────────────────

export type DeliveryContextStatus = 'active' | 'blocked' | 'delivered' | 'merging' | 'superseded';

export const deliveryContextStatusSchema = z.enum([
  'active',
  'blocked',
  'delivered',
  'merging',
  'superseded',
]);

/**
 * One logical delivery for a task generation: the stable delivery branch, its
 * PR, and the frozen target. Fix attempts reuse the same context — new
 * physical worktrees and attempt branches never fork it into a second PR.
 */
export interface DeliveryContext {
  /** Commit the current attempt checked out from (PR head on fix attempts). */
  checkoutStartSha: string;
  /** Stable branch backing the single PR for this delivery. */
  deliveryBranch: string;
  generation: number;
  /** Bound pull request, when one has been opened. */
  pr?: {
    headSha: string;
    number: number;
    url: string;
  };
  repositoryId: string;
  status: DeliveryContextStatus;
  targetBaseRef: string;
  targetBaseSha: string;
  taskId: string;
}

export const deliveryContextSchema = z.object({
  checkoutStartSha: z.string().min(1),
  deliveryBranch: z.string().min(1),
  generation: z.number().int().min(0),
  pr: z
    .object({
      headSha: z.string().min(1),
      number: z.number().int().positive(),
      url: z.string().min(1),
    })
    .optional(),
  repositoryId: z.string().min(1),
  status: deliveryContextStatusSchema,
  targetBaseRef: z.string().min(1),
  targetBaseSha: z.string().min(1),
  taskId: z.string().min(1),
});

// ── Command results ────────────────────────────────────────────────────────

/** Result of `requestReplan` / `applyPlan`. */
export type PlanApplyOutcome = 'applied' | 'noop' | 'requires_approval' | 'stale';

export const planApplyOutcomeSchema = z.enum(['applied', 'noop', 'requires_approval', 'stale']);

/** Result of `resolveExecutionTarget` — either a frozen target or a typed block reason. */
export type ExecutionTargetResolution =
  | { blockedBy: DomainErrorCode; message: string; ok: false }
  | { ok: true; target: ResolvedExecutionTarget };

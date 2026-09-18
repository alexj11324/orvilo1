/**
 * Repository + checkout + association contract (linear-workspace-v3, WM-01).
 *
 * A Repository is a shared code resource of the workspace — never a Project.
 * Its stable remote identity is `(providerHost, remoteRepositoryId)`; names,
 * owner coordinates and URLs are snapshots that can change. A fork is a
 * different repository: origin and upstream remotes must not be merged into
 * one row.
 *
 * A Checkout is an authorized local working copy on a device. Registering one
 * records code facts only — it never grants execution, push or merge rights,
 * and its absolute path is never published into external descriptions.
 *
 * An AssociationDecision is the auditable record behind every proposed,
 * applied, rejected or revoked link between a domain object and a repository.
 * Deterministic evidence (stable ids, controlled create receipts, verified
 * remotes) may apply directly; semantic evidence (name/description/history
 * similarity) only proposes or applies revocably — it never merges existing
 * projects, widens ACLs or reassigns human owners.
 */

// ── Repository ─────────────────────────────────────────────────────────────

export type RepositoryStatus = 'active' | 'archived' | 'pending_verification';

export type RepositoryVisibility = 'private' | 'public';

/** Coordinate snapshot — may drift on rename; identity lives elsewhere. */
export interface RepositoryCoordinate {
  defaultBranch?: string | null;
  name: string;
  owner: string;
  url?: string | null;
}

export interface RepositoryItem {
  /** Snapshot of the last known remote coordinate. */
  coordinate: RepositoryCoordinate;
  createdAt: Date;
  id: string;
  /** True when the remote is a fork — always a distinct repository row. */
  isFork: boolean;
  /** Stable identity for a repo with no verified remote (local-only). */
  localOnlyKey: string | null;
  /** When the remote is a fork, its parent coordinate snapshot. */
  parentCoordinate?: RepositoryCoordinate | null;
  /** e.g. `github.com`. */
  providerHost: string;
  /** Provider's stable repository id (GitHub repo id), null until verified. */
  remoteRepositoryId: string | null;
  status: RepositoryStatus;
  updatedAt: Date;
  visibility: RepositoryVisibility;
  workspaceId: string;
}

// ── Checkout ───────────────────────────────────────────────────────────────

export type CheckoutRemoteRole = 'origin' | 'upstream' | 'other';

export type CheckoutStatus = 'active' | 'revoked' | 'stale';

export interface RepositoryCheckoutItem {
  /** User who authorized this directory to be inspected/used. */
  authorizedByUserId: string | null;
  /** Canonicalized absolute path on the device; server-side only. */
  canonicalPath: string;
  createdAt: Date;
  deviceId: string | null;
  id: string;
  lastVerifiedAt: Date | null;
  remoteRepositoryId: string | null;
  remoteRole: CheckoutRemoteRole;
  remoteUrl: string | null;
  repositoryId: string;
  status: CheckoutStatus;
  updatedAt: Date;
  workspaceId: string;
}

// ── Relations ──────────────────────────────────────────────────────────────

/** Which domain objects can be associated with a repository. */
export type AssociationRelationKind =
  'project_repository' | 'task_repository' | 'team_repository_default';

export type AssociationSourceKind = 'project' | 'task' | 'team';

export type AssociationDecisionStatus = 'applied' | 'proposed' | 'rejected' | 'revoked';

/**
 * Where a decision came from. `deterministic` covers stable ids, controlled
 * create receipts and verified remotes; `ai` covers model-ranked semantic
 * candidates. `manual` is an explicit user link; `import` a synced fact.
 */
export type AssociationSource = 'ai' | 'deterministic' | 'import' | 'manual';

export type AssociationEvidenceKind =
  | 'ai_suggestion'
  | 'controlled_create_receipt'
  | 'description_similarity'
  | 'explicit_link'
  | 'historical_pr'
  | 'name_similarity'
  | 'path_hint'
  | 'stable_id'
  | 'verified_remote';

export interface AssociationEvidence {
  /** Short machine label or human-readable justification for audit. */
  detail: string;
  kind: AssociationEvidenceKind;
}

/**
 * Auditable association record. `inputRevision`, `policyRevision` and
 * `decisionRevision` freeze the evidence/policy basis so a stale decision
 * cannot silently re-apply after inputs changed.
 */
export interface AssociationDecisionItem {
  /** Numeric model confidence when produced by ranking; null otherwise. */
  confidence: number | null;
  createdAt: Date;
  decidedAt: Date | null;
  decidedByUserId: string | null;
  decisionRevision: number;
  evidence: AssociationEvidence[];
  id: string;
  idempotencyKey: string;
  inputRevision: number;
  policyRevision: number;
  relation: AssociationRelationKind;
  /** Human-readable reason the decision ended rejected/revoked. */
  resolutionNote?: string | null;
  revokedAt: Date | null;
  source: AssociationSource;
  sourceId: string;
  sourceKind: AssociationSourceKind;
  status: AssociationDecisionStatus;
  /** Repository row id the association points at. */
  targetRepositoryId: string;
  updatedAt: Date;
  workspaceId: string;
}

// ── Resource resolution ────────────────────────────────────────────────────

/**
 * Deterministic precedence for picking a task's execution repository:
 * explicit task target → confirmed primary project repository → confirmed
 * team default → approved candidates. `ambiguous` is a blocking state — the
 * resolver never silently picks the first candidate.
 */
export type RepositoryResolution =
  | { ok: true; repositoryId: string; source: 'task' | 'project' | 'team' | 'single_candidate' }
  | { candidates: string[]; ok: false; reason: 'ambiguous' | 'unresolved' };

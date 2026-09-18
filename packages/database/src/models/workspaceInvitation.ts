import { createHash, randomBytes } from 'node:crypto';

import { INVITATION_EXPIRY_DAYS } from '@orvilo/const';
import { and, asc, eq, lt, sql } from 'drizzle-orm';

import type { ProjectMemberRole } from '../schemas/projectMember';
import type { WorkspaceInvitationItem } from '../schemas/workspace';
import { workspaceInvitations } from '../schemas/workspace';
import type { WorkspaceInvitationProjectItem } from '../schemas/workspaceInvitationProject';
import { workspaceInvitationProjects } from '../schemas/workspaceInvitationProject';
import type { OrviloDatabase, Transaction } from '../type';

/**
 * Auth-system email normalization: lowercase + trim ONLY. Dots and `+tag`
 * suffixes are preserved on purpose — the invite must match the exact
 * verified-email semantics of the auth provider, and stripping them would
 * let `a.b+x@y` claim an invite meant for `ab@y`.
 */
export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

const sha256Hex = (value: string): string => createHash('sha256').update(value).digest('hex');

export interface WorkspaceInvitationProjectGrant {
  projectId: string;
  role?: ProjectMemberRole;
}

export interface WorkspaceInvitationWithGrants {
  invitation: WorkspaceInvitationItem;
  projectGrants: WorkspaceInvitationProjectItem[];
}

/**
 * Secure workspace-invitation lifecycle. The raw bearer token is a
 * `crypto.randomBytes(32)` value returned exactly once at issue/resend time;
 * only its SHA-256 digest (`tokenHash`) is ever persisted or queried.
 * `generation` bumps on resend so an older link in a stale mail dies.
 * Terminal transitions are conditional writes (pending → accepted/revoked/
 * expired), so a consumed invitation cannot be replayed and a revoke cannot
 * race an accept.
 */
export class WorkspaceInvitationModel {
  private readonly db: OrviloDatabase;
  private readonly userId: string;

  constructor(db: OrviloDatabase, userId: string) {
    this.db = db;
    this.userId = userId;
  }

  static normalizeEmail = (email: string): string => normalizeEmail(email);

  /** Fresh (raw, digest) pair — the raw half is for transport only, never persistence. */
  generateInvitationToken = (): { token: string; tokenHash: string } => {
    const token = randomBytes(32).toString('base64url');
    return { token, tokenHash: sha256Hex(token) };
  };

  /**
   * Insert a pending invitation plus its intended project grants in one
   * transaction. The returned `token` is the only place the raw secret ever
   * leaves the model — the row carries only `tokenHash`.
   */
  createInvitation = async (
    params: {
      /** `workspaces.policyVersion` snapshot at issuance; audit only. */
      createdByPolicyVersion?: number;
      /** Display/raw email; `emailNormalized` wins when both are supplied. */
      email?: string;
      emailNormalized?: string;
      expiresAt?: Date;
      inviterId?: string;
      projectGrants?: WorkspaceInvitationProjectGrant[];
      role?: 'admin' | 'member' | 'viewer';
      workspaceId: string;
    },
    tx?: Transaction,
  ): Promise<{ invitation: WorkspaceInvitationItem; token: string }> => {
    const { token, tokenHash } = this.generateInvitationToken();
    const expiresAt =
      params.expiresAt ?? new Date(Date.now() + INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
    const email = params.email ?? params.emailNormalized;

    const run = async (executor: Transaction | OrviloDatabase) => {
      const [invitation] = await executor
        .insert(workspaceInvitations)
        .values({
          createdByPolicyVersion: params.createdByPolicyVersion,
          email,
          emailNormalized: params.emailNormalized ?? (email ? normalizeEmail(email) : undefined),
          expiresAt,
          inviterId: params.inviterId ?? this.userId,
          lastSentAt: new Date(),
          role: params.role ?? 'member',
          tokenHash,
          workspaceId: params.workspaceId,
        })
        .returning();

      if (params.projectGrants && params.projectGrants.length > 0) {
        await executor.insert(workspaceInvitationProjects).values(
          params.projectGrants.map((grant) => ({
            invitationId: invitation.id,
            projectId: grant.projectId,
            role: grant.role ?? 'contributor',
          })),
        );
      }

      return { invitation, token };
    };

    return tx ? run(tx) : this.db.transaction(run);
  };

  /** Lookup by the raw bearer token — hashed before it ever touches the query. */
  findByToken = async (
    token: string,
    tx?: Transaction,
  ): Promise<WorkspaceInvitationItem | undefined> => {
    const executor = tx ?? this.db;
    await this.markExpired({ tokenHash: sha256Hex(token) }, tx);
    const [row] = await executor
      .select()
      .from(workspaceInvitations)
      .where(eq(workspaceInvitations.tokenHash, sha256Hex(token)))
      .limit(1);
    return row;
  };

  findById = async (id: string, tx?: Transaction): Promise<WorkspaceInvitationItem | undefined> => {
    const executor = tx ?? this.db;
    await this.markExpired({ id }, tx);
    const [row] = await executor
      .select()
      .from(workspaceInvitations)
      .where(eq(workspaceInvitations.id, id))
      .limit(1);
    return row;
  };

  /** Pending invitations for the workspace, each with its intended project grants. */
  listPendingByWorkspace = async (
    workspaceId: string,
    tx?: Transaction,
  ): Promise<WorkspaceInvitationWithGrants[]> => {
    const executor = tx ?? this.db;
    await this.markExpired({ workspaceId }, tx);
    const rows = await executor
      .select({ grant: workspaceInvitationProjects, invitation: workspaceInvitations })
      .from(workspaceInvitations)
      .leftJoin(
        workspaceInvitationProjects,
        eq(workspaceInvitationProjects.invitationId, workspaceInvitations.id),
      )
      .where(
        and(
          eq(workspaceInvitations.workspaceId, workspaceId),
          eq(workspaceInvitations.status, 'pending'),
        ),
      )
      .orderBy(asc(workspaceInvitations.createdAt), asc(workspaceInvitations.id));

    const byId = new Map<string, WorkspaceInvitationWithGrants>();
    for (const row of rows) {
      let entry = byId.get(row.invitation.id);
      if (!entry) {
        entry = { invitation: row.invitation, projectGrants: [] };
        byId.set(row.invitation.id, entry);
      }
      if (row.grant) entry.projectGrants.push(row.grant);
    }
    return [...byId.values()];
  };

  /**
   * `FOR UPDATE` lock on the invitation row — call only inside the caller's
   * transaction, after the workspace row is already locked (lock order:
   * workspace → invitation → membership).
   */
  lockForUpdate = async (
    id: string,
    tx?: Transaction,
  ): Promise<WorkspaceInvitationItem | undefined> => {
    const executor = tx ?? this.db;
    const [row] = await executor
      .select()
      .from(workspaceInvitations)
      .where(eq(workspaceInvitations.id, id))
      .for('update')
      .limit(1);
    return row;
  };

  /**
   * pending → accepted, recording who consumed it. Conditional on status (and
   * optionally on the generation the caller validated and on unexpired
   * validity), so concurrent accepts resolve to exactly one success and a
   * rotated/expired token can no longer consume. Returns whether this call
   * performed the transition — `false` means it was already consumed or is
   * no longer consumable.
   */
  markAccepted = async (
    id: string,
    params: { acceptedBy: string; generation?: number },
    tx?: Transaction,
  ): Promise<boolean> => {
    const executor = tx ?? this.db;
    const updated = await executor
      .update(workspaceInvitations)
      .set({ acceptedAt: new Date(), acceptedBy: params.acceptedBy, status: 'accepted' })
      .where(
        and(
          eq(workspaceInvitations.id, id),
          eq(workspaceInvitations.status, 'pending'),
          params.generation === undefined
            ? undefined
            : eq(workspaceInvitations.generation, params.generation),
          sql`${workspaceInvitations.expiresAt} > now()`,
        ),
      )
      .returning({ id: workspaceInvitations.id });
    return updated.length > 0;
  };

  /**
   * Reissue the bearer secret for a still-pending invitation: fresh tokenHash,
   * generation + 1 (every previously mailed link dies), lastSentAt stamped.
   * Returns the new raw token, or `undefined` when the row is no longer
   * pending — the secret again leaves the model only through this return.
   */
  rotateToken = async (id: string, tx?: Transaction): Promise<string | undefined> => {
    const executor = tx ?? this.db;
    const { token, tokenHash } = this.generateInvitationToken();
    const updated = await executor
      .update(workspaceInvitations)
      .set({
        generation: sql`${workspaceInvitations.generation} + 1`,
        lastSentAt: new Date(),
        tokenHash,
      })
      .where(and(eq(workspaceInvitations.id, id), eq(workspaceInvitations.status, 'pending')))
      .returning({ id: workspaceInvitations.id });
    return updated.length > 0 ? token : undefined;
  };

  /** pending → revoked. Same conditional-write discipline as `markAccepted`. */
  revoke = async (
    id: string,
    params: { revokedBy: string },
    tx?: Transaction,
  ): Promise<boolean> => {
    const executor = tx ?? this.db;
    const updated = await executor
      .update(workspaceInvitations)
      .set({ revokedAt: new Date(), revokedBy: params.revokedBy, status: 'revoked' })
      .where(and(eq(workspaceInvitations.id, id), eq(workspaceInvitations.status, 'pending')))
      .returning({ id: workspaceInvitations.id });
    return updated.length > 0;
  };

  /**
   * Lazy expiry sweep: flip still-pending rows whose `expiresAt` has passed to
   * 'expired'. Reads call this first so an expired invitation fails closed
   * even before any scheduled sweeper runs. Scope optional — no scope marks
   * every stale pending row.
   */
  markExpired = async (
    scope: { id?: string; tokenHash?: string; workspaceId?: string } = {},
    tx?: Transaction,
  ) => {
    const executor = tx ?? this.db;
    return executor
      .update(workspaceInvitations)
      .set({ status: 'expired' })
      .where(
        and(
          eq(workspaceInvitations.status, 'pending'),
          lt(workspaceInvitations.expiresAt, new Date()),
          scope.id === undefined ? undefined : eq(workspaceInvitations.id, scope.id),
          scope.tokenHash === undefined
            ? undefined
            : eq(workspaceInvitations.tokenHash, scope.tokenHash),
          scope.workspaceId === undefined
            ? undefined
            : eq(workspaceInvitations.workspaceId, scope.workspaceId),
        ),
      );
  };
}

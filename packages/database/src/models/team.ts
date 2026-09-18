import type {
  NewTeam,
  TaskWorkflowCategory,
  TeamCycleItem,
  TeamItem,
  TeamMemberItem,
  TeamMembershipRole,
  TeamOrchestrationPolicy,
  TeamStatus,
  TeamVisibility,
  TeamWorkflowStateItem,
} from '@orvilo/types';
import { and, asc, desc, eq, exists, inArray, isNotNull, or, sql } from 'drizzle-orm';

import { projectTeams, teamCycles, teamMembers, teams, teamWorkflowStates } from '../schemas/team';
import type { OrviloDatabase } from '../type';
import { hasActiveWorkspaceMembership, hasWorkspaceAdminAccess } from './workspace';

const toTeamItem = (row: typeof teams.$inferSelect): TeamItem => row as TeamItem;
const toTeamMemberItem = (row: typeof teamMembers.$inferSelect): TeamMemberItem =>
  row as TeamMemberItem;
const toWorkflowStateItem = (row: typeof teamWorkflowStates.$inferSelect): TeamWorkflowStateItem =>
  row as TeamWorkflowStateItem;
const toCycleItem = (row: typeof teamCycles.$inferSelect): TeamCycleItem => row as TeamCycleItem;

/**
 * Team domain model (linear-workspace-v3, WM-03).
 *
 * A Team is the long-lived responsibility domain inside a workspace. All
 * commands are workspace-scoped; visibility and membership rules follow
 * docs/implementation/linear-workspace-v3/PERMISSIONS.md — workspace
 * owner/admin sees and manages everything, public teams are readable by every
 * workspace member, private teams only by their members.
 */
export class TeamModel {
  constructor(
    private readonly db: OrviloDatabase,
    private readonly userId: string,
    private readonly workspaceId: string,
  ) {}

  private readable() {
    return and(
      eq(teams.workspaceId, this.workspaceId),
      or(
        eq(teams.visibility, 'public'),
        // Private teams are readable by their members and workspace admins.
        // Admin access is checked by callers via hasWorkspaceAdminAccess when
        // a full admin listing is required; the membership path is handled
        // through `listMemberTeamIds` joins instead of a SQL subquery here.
        exists(
          this.db
            .select({ one: sql`1` })
            .from(teamMembers)
            .where(and(eq(teamMembers.teamId, teams.id), eq(teamMembers.userId, this.userId))),
        ),
      ),
    );
  }

  // ── Commands ────────────────────────────────────────────────────────────

  /**
   * Create a team. When `isDefault` is requested — or the workspace has no
   * default yet — the flag is applied atomically inside the transaction so
   * the single-default invariant (`teams_workspace_default_unique`) holds.
   */
  create = async (params: NewTeam & { isDefault?: boolean }) => {
    return this.db.transaction(async (tx) => {
      const [{ count: teamCount }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(teams)
        .where(eq(teams.workspaceId, this.workspaceId));

      const makeDefault = params.isDefault ?? teamCount === 0;
      if (makeDefault) {
        await tx
          .update(teams)
          .set({ isDefault: false })
          .where(and(eq(teams.workspaceId, this.workspaceId), eq(teams.isDefault, true)));
      }

      const [team] = await tx
        .insert(teams)
        .values({
          createdByUserId: this.userId,
          description: params.description ?? null,
          isDefault: makeDefault,
          key: params.key.trim().toUpperCase(),
          name: params.name,
          orchestrationPolicy: params.orchestrationPolicy ?? {},
          status: params.status ?? 'active',
          visibility: params.visibility ?? 'public',
          workspaceId: this.workspaceId,
          ...(params.defaultAgentId ? { defaultAgentId: params.defaultAgentId } : {}),
        })
        .returning();

      await tx.insert(teamMembers).values({
        role: 'lead',
        teamId: team.id,
        userId: this.userId,
        workspaceId: this.workspaceId,
      });

      return toTeamItem(team);
    });
  };

  /**
   * Idempotent default-team bootstrap for imports and workspace setup.
   * Concurrent callers converge on the `(workspace_id) where is_default`
   * partial unique index — the loser's insert fails, so we create then
   * re-read.
   */
  ensureDefault = async (params: { key?: string; name?: string } = {}) => {
    const existing = await this.findDefault();
    if (existing) return existing;
    try {
      return await this.create({
        isDefault: true,
        key: params.key ?? 'TEAM',
        name: params.name ?? 'General',
      });
    } catch {
      const winner = await this.findDefault();
      if (winner) return winner;
      throw new Error('Failed to ensure default team');
    }
  };

  update = async (
    teamId: string,
    params: {
      defaultAgentId?: string | null;
      description?: string | null;
      key?: string;
      name?: string;
      orchestrationPolicy?: TeamOrchestrationPolicy;
      status?: TeamStatus;
      visibility?: TeamVisibility;
    },
  ) => {
    const policyBump = params.orchestrationPolicy
      ? { policyRevision: sql`${teams.policyRevision} + 1` }
      : {};
    const [team] = await this.db
      .update(teams)
      .set({
        ...(params.defaultAgentId !== undefined ? { defaultAgentId: params.defaultAgentId } : {}),
        ...(params.description !== undefined ? { description: params.description } : {}),
        ...(params.key !== undefined ? { key: params.key.trim().toUpperCase() } : {}),
        ...(params.name !== undefined ? { name: params.name } : {}),
        ...(params.orchestrationPolicy !== undefined
          ? { orchestrationPolicy: params.orchestrationPolicy }
          : {}),
        ...(params.status !== undefined
          ? { archivedAt: params.status === 'archived' ? new Date() : null, status: params.status }
          : {}),
        ...(params.visibility !== undefined ? { visibility: params.visibility } : {}),
        ...policyBump,
      })
      .where(and(eq(teams.id, teamId), eq(teams.workspaceId, this.workspaceId)))
      .returning();
    return team ? toTeamItem(team) : null;
  };

  /** Transactional `<key>-<n>` allocator — never `max(seq)+1` across rows. */
  allocateIssueSeq = async (
    teamId: string,
    runner?: OrviloDatabase,
  ): Promise<{ identifier: string; seq: number }> => {
    const db = runner ?? this.db;
    const [row] = await db
      .update(teams)
      .set({ nextIssueSeq: sql`${teams.nextIssueSeq} + 1` })
      .where(and(eq(teams.id, teamId), eq(teams.workspaceId, this.workspaceId)))
      .returning({ key: teams.key, seq: teams.nextIssueSeq });
    if (!row) throw new Error(`Team not found: ${teamId}`);
    return { identifier: `${row.key}-${row.seq - 1}`, seq: row.seq - 1 };
  };

  addMember = async (teamId: string, userId: string, role: TeamMembershipRole = 'member') => {
    const [member] = await this.db
      .insert(teamMembers)
      .values({ role, teamId, userId, workspaceId: this.workspaceId })
      .onConflictDoUpdate({
        set: { role },
        target: [teamMembers.teamId, teamMembers.userId],
      })
      .returning();
    return toTeamMemberItem(member);
  };

  removeMember = async (teamId: string, userId: string) => {
    await this.db
      .delete(teamMembers)
      .where(
        and(
          eq(teamMembers.teamId, teamId),
          eq(teamMembers.userId, userId),
          eq(teamMembers.workspaceId, this.workspaceId),
        ),
      );
  };

  // ── Workflow states & cycles ───────────────────────────────────────────

  /** Upsert by remote provider state id — the Linear import path. */
  upsertWorkflowStateByRemoteId = async (params: {
    category: TaskWorkflowCategory;
    color?: string | null;
    description?: string | null;
    name: string;
    position?: number | null;
    remoteStateId: string;
    teamId: string;
  }) => {
    const [state] = await this.db
      .insert(teamWorkflowStates)
      .values({
        category: params.category,
        color: params.color ?? null,
        description: params.description ?? null,
        name: params.name,
        position: params.position ?? null,
        remoteStateId: params.remoteStateId,
        teamId: params.teamId,
        workspaceId: this.workspaceId,
      })
      .onConflictDoUpdate({
        set: {
          category: params.category,
          color: params.color ?? null,
          description: params.description ?? null,
          name: params.name,
          position: params.position ?? null,
        },
        target: [teamWorkflowStates.teamId, teamWorkflowStates.remoteStateId],
        // The backing unique index is partial (`WHERE remote_state_id IS NOT
        // NULL`); Postgres only infers it when the predicate is repeated here.
        targetWhere: isNotNull(teamWorkflowStates.remoteStateId),
      })
      .returning();
    return toWorkflowStateItem(state);
  };

  listWorkflowStates = async (teamId: string) => {
    const rows = await this.db
      .select()
      .from(teamWorkflowStates)
      .where(
        and(
          eq(teamWorkflowStates.teamId, teamId),
          eq(teamWorkflowStates.workspaceId, this.workspaceId),
        ),
      )
      .orderBy(asc(teamWorkflowStates.position), asc(teamWorkflowStates.name));
    return rows.map(toWorkflowStateItem);
  };

  /** Resolve a provider state UUID to the local state row for one team. */
  findWorkflowStateByRemoteId = async (teamId: string, remoteStateId: string) => {
    const [row] = await this.db
      .select()
      .from(teamWorkflowStates)
      .where(
        and(
          eq(teamWorkflowStates.teamId, teamId),
          eq(teamWorkflowStates.remoteStateId, remoteStateId),
          eq(teamWorkflowStates.workspaceId, this.workspaceId),
        ),
      )
      .limit(1);
    return row ? toWorkflowStateItem(row) : null;
  };

  upsertCycleByRemoteId = async (params: {
    endsAt?: Date | null;
    name?: string | null;
    number?: number | null;
    remoteCycleId: string;
    startsAt?: Date | null;
    teamId: string;
  }) => {
    const [cycle] = await this.db
      .insert(teamCycles)
      .values({
        endsAt: params.endsAt ?? null,
        name: params.name ?? null,
        number: params.number ?? null,
        remoteCycleId: params.remoteCycleId,
        startsAt: params.startsAt ?? null,
        teamId: params.teamId,
        workspaceId: this.workspaceId,
      })
      .onConflictDoUpdate({
        set: {
          endsAt: params.endsAt ?? null,
          name: params.name ?? null,
          number: params.number ?? null,
          startsAt: params.startsAt ?? null,
        },
        target: [teamCycles.teamId, teamCycles.remoteCycleId],
        // Partial unique index (`WHERE remote_cycle_id IS NOT NULL`) needs the
        // predicate repeated for Postgres to infer it.
        targetWhere: isNotNull(teamCycles.remoteCycleId),
      })
      .returning();
    return toCycleItem(cycle);
  };

  listCycles = async (teamId: string) => {
    const rows = await this.db
      .select()
      .from(teamCycles)
      .where(and(eq(teamCycles.teamId, teamId), eq(teamCycles.workspaceId, this.workspaceId)))
      .orderBy(desc(teamCycles.startsAt), asc(teamCycles.name));
    return rows.map(toCycleItem);
  };

  findCycleByRemoteId = async (teamId: string, remoteCycleId: string) => {
    const [row] = await this.db
      .select()
      .from(teamCycles)
      .where(
        and(
          eq(teamCycles.teamId, teamId),
          eq(teamCycles.remoteCycleId, remoteCycleId),
          eq(teamCycles.workspaceId, this.workspaceId),
        ),
      )
      .limit(1);
    return row ? toCycleItem(row) : null;
  };

  // ── Project participation (M:N, single project row) ────────────────────

  linkProject = async (projectId: string, teamId: string) => {
    await this.db
      .insert(projectTeams)
      .values({
        addedByUserId: this.userId,
        projectId,
        teamId,
        workspaceId: this.workspaceId,
      })
      .onConflictDoNothing({ target: [projectTeams.projectId, projectTeams.teamId] });
  };

  unlinkProject = async (projectId: string, teamId: string) => {
    await this.db
      .delete(projectTeams)
      .where(
        and(
          eq(projectTeams.projectId, projectId),
          eq(projectTeams.teamId, teamId),
          eq(projectTeams.workspaceId, this.workspaceId),
        ),
      );
  };

  listTeamIdsForProject = async (projectId: string): Promise<string[]> => {
    const rows = await this.db
      .select({ teamId: projectTeams.teamId })
      .from(projectTeams)
      .where(
        and(eq(projectTeams.projectId, projectId), eq(projectTeams.workspaceId, this.workspaceId)),
      );
    return rows.map((r) => r.teamId);
  };

  listProjectIdsForTeam = async (teamId: string): Promise<string[]> => {
    const rows = await this.db
      .select({ projectId: projectTeams.projectId })
      .from(projectTeams)
      .where(and(eq(projectTeams.teamId, teamId), eq(projectTeams.workspaceId, this.workspaceId)));
    return rows.map((r) => r.projectId);
  };

  // ── Queries ────────────────────────────────────────────────────────────

  findById = async (teamId: string): Promise<TeamItem | null> => {
    const [row] = await this.db
      .select()
      .from(teams)
      .where(and(eq(teams.id, teamId), eq(teams.workspaceId, this.workspaceId)))
      .limit(1);
    return row ? toTeamItem(row) : null;
  };

  findByKey = async (key: string): Promise<TeamItem | null> => {
    const [row] = await this.db
      .select()
      .from(teams)
      .where(and(eq(teams.workspaceId, this.workspaceId), eq(teams.key, key.trim().toUpperCase())))
      .limit(1);
    return row ? toTeamItem(row) : null;
  };

  findDefault = async (): Promise<TeamItem | null> => {
    const [row] = await this.db
      .select()
      .from(teams)
      .where(and(eq(teams.workspaceId, this.workspaceId), eq(teams.isDefault, true)))
      .limit(1);
    return row ? toTeamItem(row) : null;
  };

  /** Teams the current user may read (public + own private memberships; workspace admins see all). */
  listReadable = async (): Promise<TeamItem[]> => {
    const isWorkspaceAdmin = await hasWorkspaceAdminAccess(this.db, {
      userId: this.userId,
      workspaceId: this.workspaceId,
    });
    const rows = await this.db
      .select()
      .from(teams)
      .where(isWorkspaceAdmin ? eq(teams.workspaceId, this.workspaceId) : this.readable())
      .orderBy(asc(teams.name));
    return rows.map(toTeamItem);
  };

  listMembers = async (teamId: string): Promise<TeamMemberItem[]> => {
    const rows = await this.db
      .select()
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.workspaceId, this.workspaceId)));
    return rows.map(toTeamMemberItem);
  };

  listMemberTeamIds = async (userId?: string): Promise<string[]> => {
    const rows = await this.db
      .select({ teamId: teamMembers.teamId })
      .from(teamMembers)
      .where(
        and(
          eq(teamMembers.userId, userId ?? this.userId),
          eq(teamMembers.workspaceId, this.workspaceId),
        ),
      );
    return rows.map((r) => r.teamId);
  };

  getMembershipRole = async (
    teamId: string,
    userId?: string,
  ): Promise<TeamMembershipRole | null> => {
    const [row] = await this.db
      .select({ role: teamMembers.role })
      .from(teamMembers)
      .where(
        and(
          eq(teamMembers.teamId, teamId),
          eq(teamMembers.userId, userId ?? this.userId),
          eq(teamMembers.workspaceId, this.workspaceId),
        ),
      )
      .limit(1);
    return row?.role ?? null;
  };

  // ── Authorization (PERMISSIONS.md) ─────────────────────────────────────

  /** Read: workspace admin, any member for public teams, team member for private. */
  hasReadAccess = async (teamId: string, userId?: string): Promise<boolean> => {
    const uid = userId ?? this.userId;
    const team = await this.findById(teamId);
    if (!team) return false;
    if (await hasWorkspaceAdminAccess(this.db, { userId: uid, workspaceId: this.workspaceId })) {
      return true;
    }
    if (team.visibility === 'public') {
      return hasActiveWorkspaceMembership(this.db, { userId: uid, workspaceId: this.workspaceId });
    }
    return (await this.getMembershipRole(teamId, uid)) !== null;
  };

  /** Write: workspace admin or team member (lead required for policy changes). */
  hasWriteAccess = async (teamId: string, userId?: string): Promise<boolean> => {
    const uid = userId ?? this.userId;
    if (await hasWorkspaceAdminAccess(this.db, { userId: uid, workspaceId: this.workspaceId })) {
      return true;
    }
    return (await this.getMembershipRole(teamId, uid)) !== null;
  };

  /** Team administration: workspace admin or this team's lead. */
  hasAdminAccess = async (teamId: string, userId?: string): Promise<boolean> => {
    const uid = userId ?? this.userId;
    if (await hasWorkspaceAdminAccess(this.db, { userId: uid, workspaceId: this.workspaceId })) {
      return true;
    }
    return (await this.getMembershipRole(teamId, uid)) === 'lead';
  };

  /** Filter a list of team ids down to the ones the user can read. */
  filterReadableTeamIds = async (teamIds: string[], userId?: string): Promise<string[]> => {
    if (teamIds.length === 0) return [];
    const uid = userId ?? this.userId;
    if (await hasWorkspaceAdminAccess(this.db, { userId: uid, workspaceId: this.workspaceId })) {
      return teamIds;
    }
    const memberIds = new Set(await this.listMemberTeamIds(uid));
    const rows = await this.db
      .select({ id: teams.id, visibility: teams.visibility })
      .from(teams)
      .where(and(eq(teams.workspaceId, this.workspaceId), inArray(teams.id, teamIds)));
    return rows.filter((r) => r.visibility === 'public' || memberIds.has(r.id)).map((r) => r.id);
  };
}

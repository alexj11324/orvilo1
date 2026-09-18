import type { OrviloDatabase } from '@orvilo/database';
import { TRPCError } from '@trpc/server';

import { ProjectMemberModel } from '@/database/models/projectMember';
import { UserModel } from '@/database/models/user';
import { WorkspaceMemberModel } from '@/database/models/workspaceMember';

import { emitWorkspaceEvent, recordAudit } from '../membershipLifecycle/audit';
import { findProjectsByIds } from '../membershipLifecycle/queries';
import {
  canManageProjectMembers,
  capProjectRole,
  isWorkspaceRoleName,
  type ProjectRoleName,
  type WorkspaceRoleName,
} from '../membershipLifecycle/roles';

export interface ProjectMemberSummary {
  projectId: string;
  role: string;
  user: {
    avatar: string | null;
    fullName: string | null;
    id: string;
    username: string | null;
  } | null;
  userId: string;
}

const loadWorkspaceProject = async (
  db: OrviloDatabase,
  workspaceId: string,
  projectId: string,
) => {
  const [project] = await findProjectsByIds(db, [projectId]);
  // No existence leak: an out-of-tenant or missing id reads identically.
  if (!project || project.workspaceId !== workspaceId) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found' });
  }
  return project;
};

const assertManageRights = async (
  db: OrviloDatabase,
  params: { actorUserId: string; projectId: string; workspaceRole: WorkspaceRoleName | null },
) => {
  const callerProjectRole = await new ProjectMemberModel(db, params.actorUserId).getRole(
    params.projectId,
    params.actorUserId,
  );
  if (!canManageProjectMembers(params.workspaceRole, callerProjectRole)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Project manager or workspace admin rights are required',
    });
  }
};

/**
 * The member whose project access is being set must be an active workspace
 * member; the granted role is clamped to their workspace-role ceiling so a
 * workspace viewer can never hold more than commenter.
 */
const loadActiveTarget = async (
  db: OrviloDatabase,
  params: { targetUserId: string; workspaceId: string },
) => {
  const target = await new WorkspaceMemberModel(db, params.targetUserId).getMember(
    params.workspaceId,
    params.targetUserId,
  );
  if (!target || target.suspendedAt !== null || !isWorkspaceRoleName(target.role)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Target user must be an active member of this workspace',
    });
  }
  return target;
};

export const listProjectMembers = async (
  db: OrviloDatabase,
  params: { actorUserId: string; projectId: string; workspaceId: string },
): Promise<ProjectMemberSummary[]> => {
  const project = await loadWorkspaceProject(db, params.workspaceId, params.projectId);
  // A private roster is visible only to the project's creator and its active
  // project members — answering any other workspace member would leak who was
  // granted access. NOT_FOUND keeps existence-hiding consistent with the
  // project read path.
  if (project.visibility === 'private' && project.userId !== params.actorUserId) {
    const callerProjectRole = await new ProjectMemberModel(db, params.actorUserId).getRole(
      params.projectId,
      params.actorUserId,
    );
    if (callerProjectRole === null) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found' });
    }
  }
  const members = await new ProjectMemberModel(db, params.actorUserId).listByProject(
    params.projectId,
  );
  if (members.length === 0) return [];

  const profiles = new Map(
    (
      await UserModel.getDisplayInfoByIds(
        db,
        members.map((m) => m.userId),
      )
    ).map((u) => [u.id, u]),
  );
  return members.map((member) => {
    const user = profiles.get(member.userId);
    return {
      projectId: params.projectId,
      role: member.role,
      user: user
        ? { avatar: user.avatar, fullName: user.fullName, id: user.id, username: user.username }
        : null,
      userId: member.userId,
    };
  });
};

export const addProjectMember = async (
  db: OrviloDatabase,
  params: {
    actorUserId: string;
    ipAddress?: string;
    projectId: string;
    role: ProjectRoleName;
    targetUserId: string;
    workspaceId: string;
    workspaceRole: WorkspaceRoleName | null;
  },
) => {
  await loadWorkspaceProject(db, params.workspaceId, params.projectId);
  await assertManageRights(db, {
    actorUserId: params.actorUserId,
    projectId: params.projectId,
    workspaceRole: params.workspaceRole,
  });
  const target = await loadActiveTarget(db, {
    targetUserId: params.targetUserId,
    workspaceId: params.workspaceId,
  });
  const role = capProjectRole(target.role as WorkspaceRoleName, params.role);

  return db.transaction(async (tx) => {
    await new ProjectMemberModel(tx, params.actorUserId).add({
      projectId: params.projectId,
      role,
      userId: params.targetUserId,
      workspaceId: params.workspaceId,
    });
    await recordAudit(tx, {
      action: 'project_member.added',
      ipAddress: params.ipAddress,
      metadata: { role },
      resourceId: params.targetUserId,
      resourceType: 'project_member',
      userId: params.actorUserId,
      workspaceId: params.workspaceId,
    });
    await emitWorkspaceEvent(tx, {
      aggregateId: params.projectId,
      aggregateType: 'project',
      eventType: 'project_member.added',
      payload: { projectId: params.projectId, role, userId: params.targetUserId },
      workspaceId: params.workspaceId,
    });
    return { added: true as const, role };
  });
};

export const changeProjectMemberRole = async (
  db: OrviloDatabase,
  params: {
    actorUserId: string;
    ipAddress?: string;
    projectId: string;
    role: ProjectRoleName;
    targetUserId: string;
    workspaceId: string;
    workspaceRole: WorkspaceRoleName | null;
  },
) => {
  await loadWorkspaceProject(db, params.workspaceId, params.projectId);
  await assertManageRights(db, {
    actorUserId: params.actorUserId,
    projectId: params.projectId,
    workspaceRole: params.workspaceRole,
  });
  const target = await loadActiveTarget(db, {
    targetUserId: params.targetUserId,
    workspaceId: params.workspaceId,
  });
  const role = capProjectRole(target.role as WorkspaceRoleName, params.role);

  return db.transaction(async (tx) => {
    const changed = await new ProjectMemberModel(tx, params.actorUserId).changeRole(
      params.projectId,
      params.targetUserId,
      role,
    );
    // No row updated → nothing happened: recording audit/event here would
    // fabricate history for a never- (or already-removed) project member.
    if (changed.length === 0) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Project member not found' });
    }
    await recordAudit(tx, {
      action: 'project_member.role_changed',
      ipAddress: params.ipAddress,
      metadata: { role },
      resourceId: params.targetUserId,
      resourceType: 'project_member',
      userId: params.actorUserId,
      workspaceId: params.workspaceId,
    });
    await emitWorkspaceEvent(tx, {
      aggregateId: params.projectId,
      aggregateType: 'project',
      eventType: 'project_member.role_changed',
      payload: { projectId: params.projectId, role, userId: params.targetUserId },
      workspaceId: params.workspaceId,
    });
    return { changed: true as const, role };
  });
};

export const removeProjectMember = async (
  db: OrviloDatabase,
  params: {
    actorUserId: string;
    ipAddress?: string;
    projectId: string;
    targetUserId: string;
    workspaceId: string;
    workspaceRole: WorkspaceRoleName | null;
  },
) => {
  await loadWorkspaceProject(db, params.workspaceId, params.projectId);
  await assertManageRights(db, {
    actorUserId: params.actorUserId,
    projectId: params.projectId,
    workspaceRole: params.workspaceRole,
  });

  return db.transaction(async (tx) => {
    const removed = await new ProjectMemberModel(tx, params.actorUserId).remove(
      params.projectId,
      params.targetUserId,
    );
    // No row removed → nothing happened: recording audit/event here would
    // fabricate history for a removal of a never- (or already-) member.
    if (removed.length === 0) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Project member not found' });
    }
    await recordAudit(tx, {
      action: 'project_member.removed',
      ipAddress: params.ipAddress,
      resourceId: params.targetUserId,
      resourceType: 'project_member',
      userId: params.actorUserId,
      workspaceId: params.workspaceId,
    });
    await emitWorkspaceEvent(tx, {
      aggregateId: params.projectId,
      aggregateType: 'project',
      eventType: 'project_member.removed',
      payload: { projectId: params.projectId, userId: params.targetUserId },
      workspaceId: params.workspaceId,
    });
    return { removed: true as const };
  });
};

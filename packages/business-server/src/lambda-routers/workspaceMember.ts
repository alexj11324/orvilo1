import type { WorkspaceMemberItem } from '@orvilo/database/schemas';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import {
  changeMemberRole,
  leaveWorkspace,
  listMemberSummaries,
  previewMemberRemoval,
  removeMember,
  resumeMember,
  suspendMember,
} from '@/business/server/membershipLifecycle';
import {
  requireWorkspaceRole,
  wsAdminProcedure,
  wsCompatProcedure,
  wsMemberProcedure,
} from '@/business/server/trpc-middlewares/workspaceAuth';
import {
  issueInvitations,
  listInvitations,
} from '@/business/server/workspaceInvitation';
import { router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';

/** A membership row joined with the public profile of the member. */
export interface WorkspaceMemberSummary extends WorkspaceMemberItem {
  user: {
    avatar: string | null;
    email: string | null;
    fullName: string | null;
    username: string | null;
  } | null;
}

const wrapInternal = (domain: string, error: unknown): never => {
  if (error instanceof TRPCError) throw error;
  console.error(`[workspaceMember:${domain}]`, error);
  throw new TRPCError({
    cause: error,
    code: 'INTERNAL_SERVER_ERROR',
    message: `Failed to ${domain}`,
  });
};

const inviteInput = z.object({
  emails: z.array(z.string().min(1).max(320)).min(1).max(50),
  projectIds: z.array(z.string().min(1)).optional(),
  role: z.enum(['admin', 'member', 'viewer']).default('member'),
});

const userIdInput = z.object({ userId: z.string().min(1) });

// Cloud gates these on the compat procedure plus a role check rather than on a
// procedure that requires the header, so an unscoped call reads as empty rather
// than as a bad request. Mirror that here.
const wsCompatAdminProcedure = wsCompatProcedure.use(requireWorkspaceRole('admin'));

export const workspaceMemberRouter = router({
  changeRole: wsAdminProcedure
    .use(serverDatabase)
    .input(
      z.object({
        expectedAuthzVersion: z.number().int().min(0).optional(),
        role: z.enum(['admin', 'member', 'viewer']),
        userId: z.string().min(1),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        return await changeMemberRole(ctx.serverDB, {
          actorRole: ctx.workspaceRole ?? null,
          actorUserId: ctx.userId,
          expectedAuthzVersion: input.expectedAuthzVersion,
          ipAddress: ctx.clientIp ?? undefined,
          role: input.role,
          targetUserId: input.userId,
          workspaceId: ctx.workspaceId!,
        });
      } catch (error) {
        wrapInternal('changeRole', error);
      }
    }),

  invite: wsAdminProcedure
    .use(serverDatabase)
    .input(inviteInput)
    .mutation(async ({ input, ctx }) => {
      try {
        return await issueInvitations(ctx.serverDB, {
          emails: input.emails,
          ipAddress: ctx.clientIp ?? undefined,
          inviterRole: ctx.workspaceRole ?? null,
          inviterUserId: ctx.userId,
          projectIds: input.projectIds,
          role: input.role,
          workspaceId: ctx.workspaceId!,
        });
      } catch (error) {
        wrapInternal('invite', error);
      }
    }),

  leave: wsMemberProcedure.use(serverDatabase).mutation(async ({ ctx }) => {
    try {
      return await leaveWorkspace(ctx.serverDB, {
        ipAddress: ctx.clientIp ?? undefined,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId!,
      });
    } catch (error) {
      wrapInternal('leave', error);
    }
  }),

  list: wsCompatProcedure
    .use(serverDatabase)
    .input(z.object({ includeDeleted: z.boolean().optional() }).optional())
    .query(async ({ input, ctx }): Promise<WorkspaceMemberSummary[]> => {
      if (!ctx.workspaceId) return [];
      try {
        return await listMemberSummaries(ctx.serverDB, {
          includeDeleted: input?.includeDeleted ?? false,
          viewerIsAdmin: ctx.workspaceRole === 'owner' || ctx.workspaceRole === 'admin',
          workspaceId: ctx.workspaceId!,
        });
      } catch (error) {
        wrapInternal('list', error);
      }
    }),

  listInvitations: wsCompatAdminProcedure.use(serverDatabase).query(async ({ ctx }) => {
    if (!ctx.workspaceId) return [];
    try {
      return await listInvitations(ctx.serverDB, {
        actorUserId: ctx.userId,
        workspaceId: ctx.workspaceId!,
      });
    } catch (error) {
      wrapInternal('listInvitations', error);
    }
  }),

  removalPreview: wsAdminProcedure
    .use(serverDatabase)
    .input(userIdInput)
    .query(async ({ input, ctx }) => {
      try {
        return await previewMemberRemoval(ctx.serverDB, {
          targetUserId: input.userId,
          workspaceId: ctx.workspaceId!,
        });
      } catch (error) {
        wrapInternal('removalPreview', error);
      }
    }),

  remove: wsAdminProcedure
    .use(serverDatabase)
    .input(
      z.object({
        reassignToUserId: z.string().min(1).optional(),
        userId: z.string().min(1),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        return await removeMember(ctx.serverDB, {
          actorRole: ctx.workspaceRole ?? null,
          actorUserId: ctx.userId,
          ipAddress: ctx.clientIp ?? undefined,
          reassignToUserId: input.reassignToUserId,
          targetUserId: input.userId,
          workspaceId: ctx.workspaceId!,
        });
      } catch (error) {
        wrapInternal('remove', error);
      }
    }),

  resume: wsAdminProcedure
    .use(serverDatabase)
    .input(userIdInput)
    .mutation(async ({ input, ctx }) => {
      try {
        return await resumeMember(ctx.serverDB, {
          actorRole: ctx.workspaceRole ?? null,
          actorUserId: ctx.userId,
          ipAddress: ctx.clientIp ?? undefined,
          targetUserId: input.userId,
          workspaceId: ctx.workspaceId!,
        });
      } catch (error) {
        wrapInternal('resume', error);
      }
    }),

  suspend: wsAdminProcedure
    .use(serverDatabase)
    .input(userIdInput)
    .mutation(async ({ input, ctx }) => {
      try {
        return await suspendMember(ctx.serverDB, {
          actorRole: ctx.workspaceRole ?? null,
          actorUserId: ctx.userId,
          ipAddress: ctx.clientIp ?? undefined,
          targetUserId: input.userId,
          workspaceId: ctx.workspaceId!,
        });
      } catch (error) {
        wrapInternal('suspend', error);
      }
    }),
});

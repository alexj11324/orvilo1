import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import {
  changeMemberRole,
  leaveWorkspace,
  listMemberSummaries,
  type MemberSummary,
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
import { issueInvitations, listInvitations } from '@/business/server/workspaceInvitation';
import { router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';

/** A membership row joined with the member's profile and workload counters. */
export type WorkspaceMemberSummary = MemberSummary;

const wrapInternal = (domain: string, error: unknown): never => {
  if (error instanceof TRPCError) throw error;
  console.error(`[workspaceMember:${domain}]`, error);
  throw new TRPCError({
    cause: error,
    code: 'INTERNAL_SERVER_ERROR',
    message: `Failed to ${domain}`,
  });
};

const inviteInput = z
  .object({
    // Legacy single-invite shape the released CLI still sends (`{email, role}`).
    email: z.string().min(1).max(320).optional(),
    emails: z.array(z.string().min(1).max(320)).max(50).optional(),
    projectIds: z.array(z.string().min(1)).optional(),
    projectRoles: z
      .array(
        z.object({
          projectId: z.string().min(1),
          role: z.enum(['commenter', 'contributor', 'manager', 'viewer']),
        }),
      )
      .optional(),
    role: z.enum(['admin', 'member', 'viewer']).default('member'),
  })
  .refine(
    (input) => {
      const total = (input.emails?.length ?? 0) + (input.email ? 1 : 0);
      return total >= 1 && total <= 50;
    },
    { message: 'Provide between 1 and 50 emails' },
  );

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
        return wrapInternal('changeRole', error);
      }
    }),

  invite: wsAdminProcedure
    .use(serverDatabase)
    .input(inviteInput)
    .mutation(async ({ input, ctx }) => {
      try {
        return await issueInvitations(ctx.serverDB, {
          // Both wire shapes converge on one list — `email` is the legacy
          // single-invite spelling, `emails` the batch one.
          emails: [...(input.emails ?? []), ...(input.email ? [input.email] : [])],
          ipAddress: ctx.clientIp ?? undefined,
          inviterRole: ctx.workspaceRole ?? null,
          inviterUserId: ctx.userId,
          projectIds: input.projectIds,
          projectRoles: input.projectRoles,
          role: input.role,
          workspaceId: ctx.workspaceId!,
        });
      } catch (error) {
        return wrapInternal('invite', error);
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
      return wrapInternal('leave', error);
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
        return wrapInternal('list', error);
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
      return wrapInternal('listInvitations', error);
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
        return wrapInternal('removalPreview', error);
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
        return wrapInternal('remove', error);
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
        return wrapInternal('resume', error);
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
        return wrapInternal('suspend', error);
      }
    }),
});

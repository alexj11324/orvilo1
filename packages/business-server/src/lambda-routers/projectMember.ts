import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import {
  addProjectMember,
  changeProjectMemberRole,
  listProjectMembers,
  removeProjectMember,
} from '@/business/server/projectMembership';
import { wsMemberProcedure } from '@/business/server/trpc-middlewares/workspaceAuth';
import { router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';

const projectRoleSchema = z.enum(['manager', 'contributor', 'commenter', 'viewer']);

const projectScoped = z.object({ projectId: z.string().min(1) });
const memberRoleInput = projectScoped.extend({
  role: projectRoleSchema,
  userId: z.string().min(1),
});
const memberInput = projectScoped.extend({ userId: z.string().min(1) });

const wrapInternal = (domain: string, error: unknown): never => {
  if (error instanceof TRPCError) throw error;
  console.error(`[projectMember:${domain}]`, error);
  throw new TRPCError({
    cause: error,
    code: 'INTERNAL_SERVER_ERROR',
    message: `Failed to ${domain}`,
  });
};

// Project membership is meaningful only inside a workspace: every procedure
// needs an active caller membership (wsMemberProcedure), and the service then
// checks project-manage rights plus the workspace-role ceiling on the target.
export const projectMemberRouter = router({
  add: wsMemberProcedure
    .use(serverDatabase)
    .input(memberRoleInput)
    .mutation(async ({ input, ctx }) => {
      try {
        return await addProjectMember(ctx.serverDB, {
          actorUserId: ctx.userId,
          ipAddress: ctx.clientIp ?? undefined,
          projectId: input.projectId,
          role: input.role,
          targetUserId: input.userId,
          workspaceId: ctx.workspaceId!,
          workspaceRole: ctx.workspaceRole ?? null,
        });
      } catch (error) {
        return wrapInternal('add', error);
      }
    }),

  changeRole: wsMemberProcedure
    .use(serverDatabase)
    .input(memberRoleInput)
    .mutation(async ({ input, ctx }) => {
      try {
        return await changeProjectMemberRole(ctx.serverDB, {
          actorUserId: ctx.userId,
          ipAddress: ctx.clientIp ?? undefined,
          projectId: input.projectId,
          role: input.role,
          targetUserId: input.userId,
          workspaceId: ctx.workspaceId!,
          workspaceRole: ctx.workspaceRole ?? null,
        });
      } catch (error) {
        return wrapInternal('changeRole', error);
      }
    }),

  list: wsMemberProcedure
    .use(serverDatabase)
    .input(projectScoped)
    .query(async ({ input, ctx }) => {
      try {
        return await listProjectMembers(ctx.serverDB, {
          actorUserId: ctx.userId,
          projectId: input.projectId,
          workspaceId: ctx.workspaceId!,
        });
      } catch (error) {
        return wrapInternal('list', error);
      }
    }),

  remove: wsMemberProcedure
    .use(serverDatabase)
    .input(memberInput)
    .mutation(async ({ input, ctx }) => {
      try {
        return await removeProjectMember(ctx.serverDB, {
          actorUserId: ctx.userId,
          ipAddress: ctx.clientIp ?? undefined,
          projectId: input.projectId,
          targetUserId: input.userId,
          workspaceId: ctx.workspaceId!,
          workspaceRole: ctx.workspaceRole ?? null,
        });
      } catch (error) {
        return wrapInternal('remove', error);
      }
    }),
});

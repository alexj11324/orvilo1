import { z } from 'zod';

import { SlackIntegrationModel } from '@/database/models/slackIntegration';
import { hasWorkspaceAdminAccess } from '@/database/models/workspace';
import { getSlackConfig } from '@/envs/slack';
import { authedProcedure, router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';
import { createSlackIntegrationService } from '@/server/services/slackIntegration';
import { stopSlackChannelsRuntime } from '@/server/services/slackIntegration/channelsRuntime';
import { readOAuthResult } from '@/server/services/slackIntegration/oauthState';

const inputSchema = z.object({ workspaceId: z.string().min(1) });
const attemptSchema = z.string().regex(/^[\w-]{16,128}$/);
const procedure = authedProcedure
  .use(serverDatabase)
  .input(inputSchema)
  .use(async ({ ctx, input, next }) => {
    const service = createSlackIntegrationService(ctx.serverDB);
    await service.assertMember(input.workspaceId, ctx.userId);
    return next({
      ctx: {
        slackService: service,
        slackModel: new SlackIntegrationModel(ctx.serverDB, input.workspaceId),
      },
    });
  });
const adminProcedure = procedure.use(async ({ ctx, input, next }) => {
  await ctx.slackService.assertMember(input.workspaceId, ctx.userId, true);
  return next();
});
export const slackIntegrationRouter = router({
  channels: adminProcedure
    .input(z.object({ cursor: z.string().max(1000).optional() }))
    .query(async ({ ctx, input }) => ({
      data: await ctx.slackService.channels(input.workspaceId, input.cursor),
      success: true,
    })),
  deleteBinding: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.slackModel.deleteBinding(input.id);
      return { success: true };
    }),
  disconnect: adminProcedure.mutation(async ({ ctx }) => {
    const installation = await ctx.slackModel.installation();
    await ctx.slackModel.disconnect();
    if (installation) await stopSlackChannelsRuntime(installation.slackTeamId);
    return { success: true };
  }),
  disconnectPersonal: procedure.mutation(async ({ ctx }) => {
    await ctx.slackModel.disconnectPersonal(ctx.userId);
    return { success: true };
  }),
  oauthResult: procedure
    .input(z.object({ attempt: attemptSchema }))
    .query(async ({ ctx, input }) => ({
      data: await readOAuthResult({
        workspaceId: input.workspaceId,
        userId: ctx.userId,
        attempt: input.attempt,
      }),
      success: true,
    })),
  saveBinding: adminProcedure
    .input(
      z.object({ slackChannelId: z.string().regex(/^[CG][A-Z0-9]+$/), agentId: z.string().min(1) }),
    )
    .mutation(async ({ ctx, input }) => ({
      data: await ctx.slackService.saveBinding({ ...input, userId: ctx.userId }),
      success: true,
    })),
  startOAuth: procedure
    .input(z.object({ mode: z.enum(['workspace', 'personal']), attempt: attemptSchema }))
    .mutation(async ({ ctx, input }) => ({
      data: {
        authorizationUrl: await ctx.slackService.startOAuth({ ...input, userId: ctx.userId }),
      },
      success: true,
    })),
  status: procedure.query(async ({ ctx, input }) => {
    const installation = await ctx.slackModel.installation();
    const connection = installation ? await ctx.slackModel.connection(ctx.userId) : undefined;
    const env = getSlackConfig();
    const availableAgents = await ctx.slackService.availableAgents(input.workspaceId, ctx.userId);
    const availableNames = new Map(availableAgents.map((agent) => [agent.id, agent.name]));
    return {
      data: {
        configured: !!(env.SLACK_CLIENT_ID && env.SLACK_CLIENT_SECRET && env.SLACK_SIGNING_SECRET),
        canManage: await hasWorkspaceAdminAccess(ctx.serverDB, {
          workspaceId: input.workspaceId,
          userId: ctx.userId,
        }),
        installation: installation
          ? {
              id: installation.id,
              teamId: installation.slackTeamId,
              teamName: installation.teamName,
              botUserId: installation.botUserId,
              installedAt: installation.createdAt,
            }
          : null,
        personalConnection: connection
          ? {
              slackUserId: connection.slackUserId,
              displayName: connection.displayName ?? undefined,
            }
          : null,
        bindings: (await ctx.slackModel.bindings())
          .filter((binding) => availableNames.has(binding.agentId))
          .map((binding) => ({ ...binding, agentName: availableNames.get(binding.agentId)! })),
        availableAgents,
      },
      success: true,
    };
  }),
});

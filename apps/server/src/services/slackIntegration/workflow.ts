import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { WorkspaceModel } from '@/database/models/workspace';
import { getServerDB } from '@/database/server';
import { appEnv } from '@/envs/app';

import { createSlackIntegrationService } from '.';
import { getSlackChannelsRuntime } from './channelsRuntime';
import { resolvePendingSlackReply, submitPendingSlackReply } from './nativeReply';
import { createSlackChannelsStore } from './store';

export const slackEventInput = z.object({
  body: z.record(z.string(), z.unknown()),
  conversationKey: z.string().min(1),
  installationId: z.string().uuid(),
  teamId: z.string().min(1),
  tokenRevision: z.string().uuid(),
});

export const runSlackIntegrationEvent = async (input: z.infer<typeof slackEventInput>) => {
  const database = await getServerDB();
  const service = createSlackIntegrationService(database);
  const installation = await service.getInstallationByTeamId(input.teamId);
  // Queued deliveries cannot survive disconnect or borrow a replacement grant.
  if (
    !installation ||
    installation.id !== input.installationId ||
    installation.tokenRevision !== input.tokenRevision
  )
    return { skipped: true };
  const runtime = await getSlackChannelsRuntime(
    {
      botToken: await service.getBotToken(installation),
      id: installation.id,
      teamId: installation.slackTeamId,
      tokenRevision: installation.tokenRevision,
    },
    {
      database,
      issueUrl: async ({ taskId, userId, workspaceId }) => {
        const workspace = await new WorkspaceModel(database, userId).findById(workspaceId);
        if (!workspace) throw new TRPCError({ code: 'NOT_FOUND', message: 'Workspace not found' });
        return `${appEnv.APP_URL.replace(/\/$/, '')}/${encodeURIComponent(workspace.slug)}/task/${encodeURIComponent(taskId)}`;
      },
      resolvePendingReply: async (scope) => {
        try {
          return await resolvePendingSlackReply({ ...scope, db: database });
        } catch (error) {
          if (
            error instanceof TRPCError &&
            (error.code === 'FORBIDDEN' || error.code === 'NOT_FOUND')
          )
            return null;
          throw error;
        }
      },
      submitReply: (scope) => submitPendingSlackReply({ ...scope, db: database }),
      resolveBinding: (identity) => service.resolveSlackBinding(identity),
      resolveUser: async (identity) => {
        const user = await service.resolveSlackUser(identity);
        return user ? { id: user.userId } : null;
      },
      store: createSlackChannelsStore(installation.id),
    },
  );
  await runtime.dispatch(input.body);
  return { success: true };
};

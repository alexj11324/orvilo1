import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { AgentOperationModel } from '@/database/models/agentOperation';
import { MessageModel } from '@/database/models/message';
import { TopicModel } from '@/database/models/topic';
import { WorkspaceModel } from '@/database/models/workspace';
import { getServerDB } from '@/database/server';
import { appEnv } from '@/envs/app';
import { slackEnv } from '@/envs/slack';
import {
  extractTextFromMessage,
  findLastAssistantMessage,
  normalizeCompletionMessages,
} from '@/server/services/agentExecution/CompletionLifecycle';

import { createSlackIntegrationService } from '.';
import { getSlackChatRuntime } from './chatRuntime';
import { resolvePendingSlackReply, submitPendingSlackReply } from './nativeReply';
import { createSlackChatStore } from './store';

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
  const runtime = await getSlackChatRuntime(
    {
      botToken: await service.getBotToken(installation),
      botUserId: installation.botUserId,
      signingSecret: slackEnv.SLACK_SIGNING_SECRET!,
      id: installation.id,
      teamId: installation.slackTeamId,
      tokenRevision: installation.tokenRevision,
    },
    () => ({
      database,
      resolveCompletedResponse: async ({ agentId, responseId, userId, workspaceId }) => {
        const topic = await new TopicModel(database, userId, workspaceId).findOwnTopicById(
          responseId,
        );
        if (topic?.userId !== userId || topic.agentId !== agentId || topic.trigger !== 'slack')
          return null;
        const [operation] = await new AgentOperationModel(
          database,
          userId,
          workspaceId,
        ).listByTopic(responseId, 1);
        if (
          operation?.agentId !== agentId ||
          operation.status !== 'done' ||
          operation.trigger !== 'slack'
        )
          return null;
        const messages = await new MessageModel(database, userId, workspaceId).query({
          topicId: responseId,
        });
        const text = extractTextFromMessage(
          findLastAssistantMessage(normalizeCompletionMessages(messages)),
        );
        return text?.trim() ? text : null;
      },
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
      store: createSlackChatStore(installation.id),
    }),
  );
  await runtime.dispatch(input.body);
  return { success: true };
};

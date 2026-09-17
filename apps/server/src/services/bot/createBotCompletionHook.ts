import type { ChatTopicBotContext } from '@orvilo/types';

import type { AgentHookWebhook } from '@/server/services/agentExecution/hooks/types';

const BOT_CALLBACK_URL = '/api/agent/webhooks/bot-callback';

export interface CreateBotCompletionHookParams {
  body?: Record<string, unknown>;
  botContext: ChatTopicBotContext;
  userId: string;
  workspaceId?: string;
}

export const createBotCompletionWebhook = ({
  botContext,
  body,
  userId,
  workspaceId,
}: CreateBotCompletionHookParams): AgentHookWebhook => ({
  body: {
    applicationId: botContext.applicationId,
    messengerInstallationKey: botContext.messengerInstallationKey,
    platformThreadId: botContext.platformThreadId,
    type: 'completion',
    userId,
    workspaceId,
    ...body,
  },
  delivery: 'hatchet',
  fallback: 'none',
  url: BOT_CALLBACK_URL,
});

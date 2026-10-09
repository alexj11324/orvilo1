import type { SlackIntegrationStatus } from '@orvilo/types';

import { lambdaClient } from '@/libs/trpc/client';

export type SlackChannelBinding = SlackIntegrationStatus['bindings'][number];
export type SlackAgentChoice = SlackIntegrationStatus['availableAgents'][number];
export interface SlackChannelChoice {
  id: string;
  isPrivate: boolean;
  name: string;
}
export type SlackOAuthMode = 'workspace' | 'personal';

export const slackIntegrationService = {
  async status(workspaceId: string): Promise<SlackIntegrationStatus> {
    const response = await lambdaClient.slackIntegration.status.query({ workspaceId });
    return response.data;
  },
  async startOAuth(workspaceId: string, mode: SlackOAuthMode, attempt: string) {
    const response = await lambdaClient.slackIntegration.startOAuth.mutate({
      workspaceId,
      mode,
      attempt,
    });
    return response.data;
  },
  async oauthResult(workspaceId: string, attempt: string) {
    const response = await lambdaClient.slackIntegration.oauthResult.query({
      workspaceId,
      attempt,
    });
    return response.data;
  },
  async channels(
    workspaceId: string,
    cursor?: string,
  ): Promise<{ channels: SlackChannelChoice[]; nextCursor?: string }> {
    const response = await lambdaClient.slackIntegration.channels.query({ workspaceId, cursor });
    return response.data;
  },
  async saveBinding(workspaceId: string, slackChannelId: string, agentId: string) {
    return lambdaClient.slackIntegration.saveBinding.mutate({
      workspaceId,
      slackChannelId,
      agentId,
    });
  },
  async deleteBinding(workspaceId: string, id: string) {
    return lambdaClient.slackIntegration.deleteBinding.mutate({ workspaceId, id });
  },
  async disconnect(workspaceId: string) {
    return lambdaClient.slackIntegration.disconnect.mutate({ workspaceId });
  },
  async disconnectPersonal(workspaceId: string) {
    return lambdaClient.slackIntegration.disconnectPersonal.mutate({ workspaceId });
  },
};

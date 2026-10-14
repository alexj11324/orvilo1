export interface SlackIntegrationStatus {
  availableAgents: { id: string; name: string }[];
  availableProjects?: { id: string; name: string }[];
  availableRepositories?: { id: string; name: string }[];
  bindings: {
    id: string;
    slackChannelId: string;
    slackChannelName: string;
    agentId: string;
    agentName: string;
    projectId?: string | null;
    repositoryId?: string | null;
  }[];
  canManage: boolean;
  configured: boolean;
  installation: null | {
    id: string;
    teamId: string;
    teamName: string;
    botUserId: string;
    installedAt: Date;
  };
  personalConnection: null | { slackUserId: string; displayName?: string };
}

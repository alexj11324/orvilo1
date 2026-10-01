import { lambdaClient } from '@/libs/trpc/client';

export const mcpEventsService = {
  stop: (taskId: string) => lambdaClient.mcpEvents.stop.mutate({ taskId }),
  create: (input: {
    taskId: string;
    connectorId: string;
    eventName: string;
    arguments: Record<string, unknown>;
    filters: {
      path: string[];
      operator: 'equals' | 'contains';
      value: string | number | boolean | null;
    }[];
  }) => lambdaClient.mcpEvents.create.mutate(input),
  list: (taskId: string) => lambdaClient.mcpEvents.list.query({ taskId }),
  discover: (taskId: string, connectorId: string) =>
    lambdaClient.mcpEvents.discover.query({ connectorId, taskId }),
  sources: (taskId: string) => lambdaClient.mcpEvents.sources.query({ taskId }),
};

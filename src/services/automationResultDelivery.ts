import type { AutomationResultWebhookConfig } from '@orvilo/types';

import { lambdaClient } from '@/libs/trpc/client';

export const automationResultDeliveryService = {
  credentials: (taskId: string) =>
    lambdaClient.task.listAutomationOutputCredentials.query({ taskId }),
  list: (taskId: string) => lambdaClient.task.listAutomationResults.query({ taskId }),
  retry: (id: string, acknowledgeUnknown = false) =>
    lambdaClient.task.retryAutomationResult.mutate({ id, acknowledgeUnknown }),
  update: (taskId: string, resultWebhooks: AutomationResultWebhookConfig[]) =>
    lambdaClient.task.updateAutomationOutputs.mutate({ taskId, resultWebhooks }),
};

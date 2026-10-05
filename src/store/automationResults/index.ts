import { create } from 'zustand';

import { useClientDataSWR } from '@/libs/swr';
import { automationResultDeliveryService } from '@/services/automationResultDelivery';

export const automationResultKeys = {
  credentials: (taskId: string) => ['automationResults:credentials', taskId] as const,
  list: (taskId: string) => ['automationResults:list', taskId] as const,
};

/** Results remain in the application's workspace-scoped cache. */
export const useAutomationResultsStore = create(() => ({
  useFetchResults: (taskId?: string) =>
    useClientDataSWR(
      taskId ? automationResultKeys.list(taskId) : null,
      () => automationResultDeliveryService.list(taskId!),
      { refreshInterval: 10_000 },
    ),
  useFetchOutputCredentials: (taskId?: string) =>
    useClientDataSWR(taskId ? automationResultKeys.credentials(taskId) : null, () =>
      automationResultDeliveryService.credentials(taskId!),
    ),
}));

import { create } from 'zustand';

import { useClientDataSWR } from '@/libs/swr';
import { mcpEventsKeys } from '@/libs/swr/keys';
import { mcpEventsService } from '@/services/mcpEvents';

/** Server state remains in the workspace-scoped SWR cache; no second global copy. */
export const useMcpEventsStore = create(() => ({
  useFetchEventTriggers: (taskId?: string) =>
    useClientDataSWR(taskId ? mcpEventsKeys.triggers(taskId) : null, () =>
      mcpEventsService.list(taskId!),
    ),
  useFetchEventSources: (taskId?: string) =>
    useClientDataSWR(taskId ? mcpEventsKeys.sources(taskId) : null, () =>
      mcpEventsService.sources(taskId!),
    ),
  useFetchEventDefinitions: (taskId?: string, connectorId?: string) =>
    useClientDataSWR(
      taskId && connectorId ? mcpEventsKeys.definitions(taskId, connectorId) : null,
      () => mcpEventsService.discover(taskId!, connectorId!),
    ),
}));

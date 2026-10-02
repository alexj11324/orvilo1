import { useState } from 'react';

import { mcpEventsService } from '@/services/mcpEvents';
import { useMcpEventsStore } from '@/store/mcpEvents';

/** Management reads persisted task bindings; discovery and source inventory are not dependencies. */
export function useSavedEventTrigger(taskId: string) {
  const useFetch = useMcpEventsStore((state) => state.useFetchEventTriggers);
  const response = useFetch(taskId);
  const [pending, setPending] = useState(false);
  const [stopError, setStopError] = useState<unknown>();
  const [cleanupPending, setCleanupPending] = useState(false);
  const stop = async () => {
    setPending(true);
    setStopError(undefined);
    try {
      const result = await mcpEventsService.stop(taskId);
      setCleanupPending(result.data.cleanupPending);
    } catch (error) {
      setStopError(error);
    } finally {
      try {
        await response.mutate();
      } catch (error) {
        setStopError(error);
      } finally {
        setPending(false);
      }
    }
  };
  return {
    ...response,
    trigger: response.data?.data.triggers[0],
    pending,
    stopError,
    cleanupPending,
    stop,
  };
}

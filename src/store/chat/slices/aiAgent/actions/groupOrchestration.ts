import { type TaskStatusResult } from '@orvilo/types';
import { type SWRResponse } from 'swr';

import { useClientDataSWR } from '@/libs/swr';
import { aiAgentService } from '@/services/aiAgent';
import { type ChatStore } from '@/store/chat/store';
import { type StoreSetter } from '@/store/types';

// SWR key for polling task status
const SWR_USE_POLLING_TASK_STATUS = 'SWR_USE_POLLING_TASK_STATUS';

// Polling interval for task status (5 seconds)
const POLLING_INTERVAL = 5000;

/**
 * The in-browser group-orchestration engine (`GroupOrchestrationRuntime` and its
 * client-side executors) was retired together with the client LLM runtime.
 * Server-side orchestration for gateway/group flows lives on the backend; this
 * slice only keeps the server-backed sub-agent task status polling hook used by
 * task detail UIs.
 */
export const groupOrchestrationSlice = (set: Setter, get: () => ChatStore, _api?: unknown) =>
  new GroupOrchestrationActionImpl(set, get, _api);

type Setter = StoreSetter<ChatStore>;

export class GroupOrchestrationActionImpl {
  readonly #get: () => ChatStore;

  constructor(set: Setter, get: () => ChatStore, _api?: unknown) {
    void _api;
    void set;
    this.#get = get;
  }

  useEnablePollingTaskStatus = (
    threadId: string | undefined,
    messageId: string | undefined,
    enabled: boolean,
  ): SWRResponse<TaskStatusResult> => {
    return useClientDataSWR<TaskStatusResult>(
      enabled && threadId && messageId ? [SWR_USE_POLLING_TASK_STATUS, threadId] : null,
      async ([, tid]: [string, string]) => {
        return aiAgentService.getSubAgentTaskStatus({ threadId: tid });
      },
      {
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
        // Keep one fetch for terminal tasks so completed/failed detail panels can load messages,
        // but stop interval polling afterward to avoid endless status requests.
        refreshInterval: (data) => (!data || data.status === 'processing' ? POLLING_INTERVAL : 0),
        onSuccess: (data) => {
          if (data && messageId) {
            // Update taskDetail and tasks (intermediate messages)
            this.#get().internal_dispatchMessage({
              id: messageId,
              type: 'updateMessage',
              value: {
                taskDetail: data.taskDetail,
                tasks: data.messages,
              },
            });

            // Update content when task is completed or failed
            if (
              (data.status === 'completed' || data.status === 'failed') &&
              data.result !== undefined
            ) {
              this.#get().internal_dispatchMessage({
                id: messageId,
                type: 'updateMessage',
                value: { content: data.result },
              });
            }
          }
        },
      },
    );
  };
}

export type GroupOrchestrationAction = Pick<
  GroupOrchestrationActionImpl,
  keyof GroupOrchestrationActionImpl
>;

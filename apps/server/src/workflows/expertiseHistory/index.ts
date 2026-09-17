import debug from 'debug';

import { appEnv } from '@/envs/app';
import { triggerHatchetWorkflow } from '@/server/services/hatchet/workflows';

import { runExpertiseHistoryWorkflow } from './run';
import type {
  ExpertiseHistoryTopicWorkflowPayload,
  ExpertiseHistoryWorkflowPayload,
} from './types';

const log = debug('lobe-server:workflows:expertise-history');
const localRuns = new Map<string, Promise<void>>();

export class ExpertiseHistoryWorkflow {
  static async trigger(payload: ExpertiseHistoryWorkflowPayload) {
    const runId = `expertise-history-${payload.userId}-${payload.agentId}-${Date.now()}`;
    if (!appEnv.enableQueueAgentRuntime) {
      const key = `${payload.userId}:${payload.workspaceId ?? 'personal'}:${payload.agentId}`;
      const previous = localRuns.get(key) ?? Promise.resolve();
      const current = previous
        .catch(() => undefined)
        .then(() => new Promise<void>((resolve) => setTimeout(resolve, 0)))
        .then(async () => {
          try {
            const { getServerDB } = await import('@/database/server');
            const { ExpertiseIngestionService } =
              await import('@/server/services/expertise/ingestion');
            const db = await getServerDB();
            await new ExpertiseIngestionService(
              db,
              payload.userId,
              payload.workspaceId,
            ).ingestHistory(payload.agentId);
          } catch (error) {
            log('Local historical ingestion failed error=%O', error);
          }
        });
      localRuns.set(key, current);
      void current.finally(() => localRuns.get(key) === current && localRuns.delete(key));
      return { workflowRunId: `local-${runId}` };
    }

    return triggerHatchetWorkflow('/api/workflows/expertise-history/run', payload, {
      concurrencyKey: `expertise-history.${payload.userId}.${payload.agentId}`,
    });
  }

  static async triggerTopic(payload: ExpertiseHistoryTopicWorkflowPayload) {
    return triggerHatchetWorkflow('/api/workflows/expertise-history/topic', payload);
  }
}

export { runExpertiseHistoryWorkflow };
export type { ExpertiseHistoryTopicWorkflowPayload, ExpertiseHistoryWorkflowPayload };

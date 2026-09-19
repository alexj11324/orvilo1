import { getServerDB } from '@/database/server';
import { ExpertiseIngestionService } from '@/server/services/expertise/ingestion';
import { triggerHatchetWorkflow } from '@/server/services/hatchet/workflows';
import type { WorkflowContext } from '@/server/workflows/context';
import { runStep } from '@/server/workflows/step';

import type { ExpertiseHistoryWorkflowPayload } from './types';

export const runExpertiseHistoryWorkflow = async (
  context: WorkflowContext<ExpertiseHistoryWorkflowPayload>,
) => {
  const payload = context.requestPayload;
  const topics = await runStep(context, 'expertise-history:list-topics', async () => {
    const db = await getServerDB();
    return new ExpertiseIngestionService(
      db,
      payload.userId,
      payload.workspaceId,
    ).listHistoricalTopics(payload.agentId, {
      cursor: payload.cursor
        ? {
            lastActivityAt: new Date(payload.cursor.lastActivityAt),
            topicId: payload.cursor.topicId,
          }
        : undefined,
      limit: 50,
    });
  });

  for (const topic of topics) {
    await runStep(context, `expertise-history:schedule:${topic.topicId}`, () =>
      triggerHatchetWorkflow('/api/workflows/expertise-history/topic', {
        agentId: payload.agentId,
        topicId: topic.topicId,
        userId: payload.userId,
        workspaceId: payload.workspaceId,
      }),
    );
  }

  const last = topics.at(-1);
  if (topics.length === 50 && last?.lastActivityAt) {
    await runStep(context, `expertise-history:next:${last.topicId}`, () =>
      triggerHatchetWorkflow(
        '/api/workflows/expertise-history/run',
        {
          ...payload,
          cursor: { lastActivityAt: String(last.lastActivityAt), topicId: last.topicId },
        },
        { concurrencyKey: `expertise-history.${payload.userId}.${payload.agentId}` },
      ),
    );
  }

  return { scanned: topics.length };
};

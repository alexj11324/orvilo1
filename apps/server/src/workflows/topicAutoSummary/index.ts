import { triggerHatchetWorkflow } from '@/server/services/hatchet/workflows';

import type { DispatchTopicAutoSummaryPayload, ExecuteTopicAutoSummaryPayload } from './types';

const DISPATCH_PATH = '/api/workflows/topic-auto-summary/dispatch';
const EXECUTE_PATH = '/api/workflows/topic-auto-summary/execute';

export class TopicAutoSummaryWorkflow {
  static triggerDispatch(payload: DispatchTopicAutoSummaryPayload) {
    return triggerHatchetWorkflow(DISPATCH_PATH, payload, {
      concurrencyKey: 'topic-auto-summary.dispatch',
    });
  }

  static triggerExecute(payload: ExecuteTopicAutoSummaryPayload) {
    return triggerHatchetWorkflow(EXECUTE_PATH, payload, {
      concurrencyKey: `topic-auto-summary.execute.${payload.userId}.${payload.topicId}`,
    });
  }
}

export type { DispatchTopicAutoSummaryPayload, ExecuteTopicAutoSummaryPayload } from './types';

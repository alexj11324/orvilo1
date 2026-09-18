import type { TraceNameMap } from '@orvilo/types';

export const ORVILO_TRACE_HEADER = 'X-orvilo-trace';
export const ORVILO_TRACE_ID = 'X-orvilo-trace-id';
export const ORVILO_OBSERVATION_ID = 'X-orvilo-observation-id';

export interface TracePayload {
  /**
   * if user allow to trace
   */
  enabled?: boolean;
  observationId?: string;
  /**
   * chat session: agentId or groupId
   */
  sessionId?: string;
  tags?: string[];
  /**
   * chat topicId
   */
  topicId?: string;
  traceId?: string;
  traceName?: TraceNameMap;
  /**
   * user uuid
   */
  userId?: string;
}

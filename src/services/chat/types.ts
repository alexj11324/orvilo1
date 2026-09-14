import type { FetchSSEOptions } from '@orvilo/fetch-sse';
import type {
  RequestTrigger,
  RuntimeInitialContext,
  RuntimeStepContext,
  TracePayload,
} from '@orvilo/types';

interface ChatRequestMetadata extends Record<string, unknown> {
  trigger?: RequestTrigger;
}

export interface FetchOptions extends FetchSSEOptions {
  agentId?: string;
  historySummary?: string;
  /** Initial context for page editor (captured at operation start) */
  initialContext?: RuntimeInitialContext;
  metadata?: ChatRequestMetadata;
  signal?: AbortSignal | undefined;
  /** Step context for page editor (updated each step) */
  stepContext?: RuntimeStepContext;
  topicId?: string;
  trace?: TracePayload;
}

import type { ModelUsage, RuntimeInitialContext, RuntimeStepContext } from '@orvilo/types';

import type { AgentState } from './state';

/**
 * Runtime execution context passed to Agent runner
 */
export interface AgentRuntimeContext {
  /**
   * Initial context captured at operation start
   * Contains static state like initial page content that doesn't change during execution
   * Set once during initialization and passed through to Context Engine
   */
  initialContext?: RuntimeInitialContext;

  /** Zero-based instruction position within the current runtime step */
  instructionIndex?: number;

  metadata?: Record<string, unknown>;

  /** Operation ID (links to Operation for business context) */
  operationId?: string;

  /** Phase-specific payload/context */
  payload?: unknown;

  /** Current execution phase */
  phase:
    | 'init'
    | 'user_input'
    | 'llm_result'
    | 'tool_result'
    | 'tools_batch_result'
    | 'sub_agent_result'
    | 'sub_agents_batch_result'
    | 'human_response'
    | 'human_approved_tool'
    | 'human_abort'
    | 'compression_result'
    | 'error';

  /** Session info (kept for backward compatibility, will be optional in the future) */
  session?: {
    eventCount?: number;
    messageCount: number;
    sessionId: string;
    status: AgentState['status'];
    stepCount: number;
  };

  /**
   * Step context computed at the beginning of each step
   * Contains dynamic state like orvilo-agent todos that changes between steps
   * Computed by AgentRuntime and passed to Context Engine and Tool Executors
   */
  stepContext?: RuntimeStepContext;

  /** Usage statistics from the current step (if applicable) */
  stepUsage?: ModelUsage | unknown;
}

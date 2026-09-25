import { type AgentRuntimeContext, type AgentState } from '@orvilo/agent-execution';

// ==================== Step Lifecycle Callbacks ====================

/**
 * Step execution lifecycle callbacks
 * Used to inject custom logic at different stages of step execution
 */
export interface StepPresentationData {
  /** LLM text output (undefined if this was a tool step) */
  content?: string;
  /** This step's execution time in ms */
  executionTimeMs: number;
  /** LLM reasoning / thinking content (undefined if none) */
  reasoning?: string;
  /** This step's cost (LLM steps only) */
  stepCost?: number;
  /** This step's input tokens (LLM steps only) */
  stepInputTokens?: number;
  /** This step's output tokens (LLM steps only) */
  stepOutputTokens?: number;
  /** This step's total tokens (LLM steps only) */
  stepTotalTokens?: number;
  /** What this step executed */
  stepType: 'call_llm' | 'call_tool';
  /** true = next step is LLM thinking; false = next step is tool execution */
  thinking: boolean;
  /** Tools the LLM decided to call (undefined if no tool calls) */
  toolsCalling?: Array<{ apiName: string; arguments?: string; identifier: string }>;
  /** Results from tool execution (only for call_tool steps) */
  toolsResult?: Array<{
    apiName: string;
    identifier: string;
    isSuccess?: boolean;
    output?: string;
  }>;
  /** Cumulative total cost */
  totalCost: number;
  /** Cumulative input tokens */
  totalInputTokens: number;
  /** Cumulative output tokens */
  totalOutputTokens: number;
  /** Total steps executed so far */
  totalSteps: number;
  /** Cumulative total tokens */
  totalTokens: number;
}

export interface StepLifecycleCallbacks {
  /**
   * Called after step execution
   */
  onAfterStep?: (
    params: StepPresentationData & {
      operationId: string;
      shouldContinue: boolean;
      state: AgentState;
      stepIndex: number;
      stepResult: any;
    },
  ) => Promise<void>;

  /**
   * Called before step execution
   */
  onBeforeStep?: (params: {
    context?: AgentRuntimeContext;
    operationId: string;
    state: AgentState;
    stepIndex: number;
  }) => Promise<void>;

  /**
   * Called when operation completes (status changes to done/error/interrupted)
   */
  onComplete?: (params: {
    finalState: AgentState;
    operationId: string;
    reason: StepCompletionReason;
  }) => Promise<void>;
}

/**
 * Step completion reason
 */
export type StepCompletionReason =
  | 'done'
  | 'error'
  | 'interrupted'
  | 'max_steps'
  | 'cost_limit'
  | 'waiting_for_human'
  | 'waiting_for_async_tool';

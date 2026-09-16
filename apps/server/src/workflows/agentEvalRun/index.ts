import type { EvalCaseEnvironment } from '@orvilo/types';
import debug from 'debug';

import { AgentEvalRunTopicModel } from '@/database/models/agentEval';
import type { LobeChatDatabase } from '@/database/type';
import { triggerHatchetWorkflow } from '@/server/services/hatchet/workflows';

const log = debug('lobe-server:workflows:agent-eval-run');

// Workflow paths
export const WORKFLOW_PATHS = {
  executeTestCase: '/api/workflows/agent-eval-run/execute-test-case',
  finalizeRun: '/api/workflows/agent-eval-run/finalize-run',
  onThreadComplete: '/api/workflows/agent-eval-run/on-thread-complete',
  onTrajectoryComplete: '/api/workflows/agent-eval-run/on-trajectory-complete',
  paginateTestCases: '/api/workflows/agent-eval-run/paginate-test-cases',
  resumeAgentTrajectory: '/api/workflows/agent-eval-run/resume-agent-trajectory',
  resumeThreadTrajectory: '/api/workflows/agent-eval-run/resume-thread-trajectory',
  runAgentTrajectory: '/api/workflows/agent-eval-run/run-agent-trajectory',
  runBenchmark: '/api/workflows/agent-eval-run/run-benchmark',
  runThreadTrajectory: '/api/workflows/agent-eval-run/run-thread-trajectory',
} as const;

// Workflow payload types
export interface RunBenchmarkPayload {
  dryRun?: boolean;
  force?: boolean;
  runId: string;
  userId: string;
}

export interface PaginateTestCasesPayload {
  cursor?: string; // testCase.id
  runId: string;
  testCaseIds?: string[]; // For fanout chunks
  userId: string;
}

export interface ExecuteTestCasePayload {
  runId: string;
  testCaseId: string;
  userId: string;
}

export interface RunAgentTrajectoryPayload {
  runId: string;
  testCaseId: string;
  userId: string;
}

export interface ResumeAgentTrajectoryPayload {
  appContext: { topicId: string };
  caseId?: string;
  environment?: EvalCaseEnvironment;
  envPrompt?: string;
  maxSteps?: number;
  parentMessageId: string;
  runId: string;
  targetAgentId?: string;
  testCaseId: string;
  topicId: string;
  userId: string;
}

export interface FinalizeRunPayload {
  runId: string;
  userId: string;
}

export interface OnTrajectoryCompletePayload {
  cost?: number;
  duration?: number;
  errorDetail?: unknown;
  errorMessage?: string;
  llmCalls?: number;
  operationId: string;
  reason: string;
  runId: string;
  status: string;
  steps?: number;
  testCaseId: string;
  toolCalls?: number;
  totalTokens?: number;
  userId: string;
}

export interface RunThreadTrajectoryPayload {
  runId: string;
  testCaseId: string;
  threadId: string;
  topicId: string;
  userId: string;
}

export interface ResumeThreadTrajectoryPayload {
  appContext: { threadId: string; topicId: string };
  caseId?: string;
  environment?: EvalCaseEnvironment;
  envPrompt?: string;
  maxSteps?: number;
  parentMessageId: string;
  runId: string;
  targetAgentId?: string;
  testCaseId: string;
  threadId: string;
  topicId: string;
  userId: string;
}

export interface OnThreadCompletePayload {
  cost?: number;
  duration?: number;
  errorMessage?: string;
  llmCalls?: number;
  operationId: string;
  reason: string;
  runId: string;
  status: string;
  steps?: number;
  testCaseId: string;
  threadId: string;
  toolCalls?: number;
  topicId: string;
  totalTokens?: number;
  userId: string;
}

/**
 * Agent Eval Run Workflow
 *
 * Handles workflow triggering for agent evaluation run execution.
 */
export class AgentEvalRunWorkflow {
  /**
   * Trigger workflow to run benchmark (entry point)
   */
  static triggerRunBenchmark(payload: RunBenchmarkPayload) {
    log('Triggering run-benchmark workflow for run: %s', payload.runId);
    return triggerHatchetWorkflow(WORKFLOW_PATHS.runBenchmark, payload, {
      concurrencyKey: `agent-eval-run:${payload.runId}:benchmark`,
    });
  }

  /**
   * Trigger workflow to paginate test cases
   */
  static triggerPaginateTestCases(payload: PaginateTestCasesPayload) {
    log('Triggering paginate-test-cases workflow for run: %s', payload.runId);
    return triggerHatchetWorkflow(WORKFLOW_PATHS.paginateTestCases, payload);
  }

  /**
   * Trigger workflow to execute a test case K times
   */
  static triggerExecuteTestCase(payload: ExecuteTestCasePayload) {
    log(
      'Triggering execute-test-case workflow: run=%s, testCase=%s',
      payload.runId,
      payload.testCaseId,
    );
    return triggerHatchetWorkflow(WORKFLOW_PATHS.executeTestCase, payload);
  }

  /**
   * Trigger workflow to run a single agent trajectory
   */
  static triggerRunAgentTrajectory(payload: RunAgentTrajectoryPayload) {
    log(
      'Triggering run-agent-trajectory workflow: run=%s, testCase=%s',
      payload.runId,
      payload.testCaseId,
    );
    return triggerHatchetWorkflow(WORKFLOW_PATHS.runAgentTrajectory, payload);
  }

  /**
   * Trigger workflow to resume a single agent trajectory
   */
  static triggerResumeAgentTrajectory(payload: ResumeAgentTrajectoryPayload) {
    log(
      'Triggering resume-agent-trajectory workflow: run=%s, testCase=%s',
      payload.runId,
      payload.testCaseId,
    );
    return triggerHatchetWorkflow(WORKFLOW_PATHS.resumeAgentTrajectory, payload);
  }

  /**
   * Trigger workflow to run a single thread trajectory (for pass@k)
   */
  static triggerRunThreadTrajectory(payload: RunThreadTrajectoryPayload) {
    log(
      'Triggering run-thread-trajectory workflow: run=%s, testCase=%s, thread=%s',
      payload.runId,
      payload.testCaseId,
      payload.threadId,
    );
    return triggerHatchetWorkflow(WORKFLOW_PATHS.runThreadTrajectory, payload);
  }

  /**
   * Trigger workflow to resume a single thread trajectory (for pass@k)
   */
  static triggerResumeThreadTrajectory(payload: ResumeThreadTrajectoryPayload) {
    log(
      'Triggering resume-thread-trajectory workflow: run=%s, testCase=%s, thread=%s',
      payload.runId,
      payload.testCaseId,
      payload.threadId,
    );
    return triggerHatchetWorkflow(WORKFLOW_PATHS.resumeThreadTrajectory, payload);
  }

  /**
   * Trigger workflow to finalize run
   */
  static triggerFinalizeRun(payload: FinalizeRunPayload) {
    log('Triggering finalize-run workflow for run: %s', payload.runId);
    return triggerHatchetWorkflow(WORKFLOW_PATHS.finalizeRun, payload, {
      concurrencyKey: `agent-eval-run:${payload.runId}:finalize`,
    });
  }

  /**
   * Filter test cases that still need execution (RunTopic status='pending')
   * @returns Test case IDs that need execution
   */
  static async filterTestCasesNeedingExecution(
    db: LobeChatDatabase,
    params: { runId: string; testCaseIds: string[]; userId: string; workspaceId?: string },
  ): Promise<string[]> {
    const { runId, testCaseIds, userId, workspaceId } = params;
    if (testCaseIds.length === 0) return [];

    const agentEvalRunTopicModel = new AgentEvalRunTopicModel(db, userId, workspaceId);

    // Get existing RunTopics for this run
    const existingRunTopics = await agentEvalRunTopicModel.findByRunId(runId);

    // Build a set of test case IDs whose RunTopic is in 'pending' status
    const pendingTestCaseIds = new Set(
      existingRunTopics
        .filter((rt) => rt.status === 'pending')
        .map((rt: { testCaseId: string }) => rt.testCaseId),
    );

    // Return only test cases that are still pending
    return testCaseIds.filter((id) => pendingTestCaseIds.has(id));
  }
}

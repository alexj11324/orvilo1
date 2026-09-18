import {
  ConcurrencyLimitStrategy,
  type HatchetClient,
  type InputType,
  type JsonObject,
  NonRetryableError,
} from '@hatchet-dev/typescript-sdk/v1/index.js';
import type { GoalAdvanceTrigger } from '@orvilo/agent-tracing';
import type { Context as HonoContext } from 'hono';
import { z } from 'zod';

import { runStep } from '@/server/router-hono/agent/handlers/runStep';
import { runScheduleNightlyReview } from '@/server/router-hono/workflows/agent-signal/handlers/scheduleNightlyReview';
import { runGoalSweep } from '@/server/router-hono/workflows/goal/handlers/sweep';
import { sweep as linearSyncSweepHandler } from '@/server/router-hono/workflows/linear-sync/handlers/sweep';
import { runScheduleDispatch } from '@/server/router-hono/workflows/task/handlers/scheduleDispatch';
import { scheduledTopicDispatch } from '@/server/router-hono/workflows/task/handlers/scheduledTopicDispatch';
import { watchdog } from '@/server/router-hono/workflows/task/handlers/watchdog';
import { sweep as verifySweepHandler } from '@/server/router-hono/workflows/verify/handlers/sweep';
import { type DeferredReplayTarget, runDeferredReplay } from '@/server/services/bot/deferredReplay';
import { advanceGoal } from '@/server/services/goal/advanceGoal';
import { HATCHET_TASK_NAMES } from '@/server/services/hatchet/taskNames';
import type { HatchetAgentStepInput } from '@/server/services/queue/impls/hatchet';
import { runHeartbeatTick } from '@/server/services/taskRunner/heartbeatTick';
import { runScheduleTick } from '@/server/services/taskRunner/scheduleTick';

interface GoalAdvanceInput {
  goalId: string;
  trigger?: GoalAdvanceTrigger;
  userId: string;
  workspaceId?: string;
}

interface TaskHeartbeatInput {
  taskId: string;
  tickToken?: string;
  userId: string;
}

const goalAdvanceInput = z.object({
  goalId: z.string().min(1),
  trigger: z.string().optional(),
  userId: z.string().min(1),
  workspaceId: z.string().optional(),
});

const taskHeartbeatInput = z.object({
  taskId: z.string().min(1),
  tickToken: z.string().optional(),
  userId: z.string().min(1),
});

const taskScheduleExecuteInput = taskHeartbeatInput;

const agentStepInput = z.object({
  context: z.unknown().optional(),
  deduplicationKey: z.string().min(1),
  endpoint: z.string().url(),
  operationId: z.string().min(1),
  payload: z.unknown().optional(),
  priority: z.enum(['high', 'normal', 'low']),
  retries: z.number().int().min(0).max(12),
  retryDelay: z.string().optional(),
  stepIndex: z.number().int().min(0),
  timestamp: z.number(),
});

const createRunStepContext = (
  input: HatchetAgentStepInput,
  retryCount: number,
  runId: string,
): HonoContext =>
  ({
    json: (body: unknown, status = 200, headers?: HeadersInit) =>
      Response.json(body, { headers, status }),
    req: {
      header: (name: string) => {
        const normalized = name.toLowerCase();
        if (normalized === 'retry-count') return String(retryCount);
        if (normalized === 'message-id') return runId;
        return undefined;
      },
      json: async () => input,
    },
  }) as unknown as HonoContext;

const runInternalHandler = async (handler: (context: HonoContext) => Promise<Response>) => {
  const response = await handler({
    json: (body: unknown, status = 200, headers?: HeadersInit) =>
      Response.json(body, { headers, status }),
    req: { json: async () => ({}) },
  } as unknown as HonoContext);
  if (!response.ok) throw new Error(await response.text());
  return readResponseBody(response);
};

const readResponseBody = async (response: Response): Promise<JsonObject> => {
  const body = (await response.json()) as unknown;
  return body && typeof body === 'object' ? (body as JsonObject) : { body: String(body) };
};

const throwDeliveryFailure = (
  input: HatchetAgentStepInput,
  retryCount: number,
  status: number,
  body: JsonObject,
): never => {
  const message = `Hatchet delivery failed with HTTP ${status}: ${JSON.stringify(body)}`;
  if (retryCount >= input.retries) throw new NonRetryableError(message);
  throw new Error(message);
};

const deferredReplayTarget = z.object({
  applicationId: z.string().min(1),
  messengerInstallationKey: z.string().min(1).optional(),
  platform: z.string().min(1),
  platformThreadId: z.string().min(1),
});

const isDeferredReplayTarget = (value: unknown): value is DeferredReplayTarget =>
  deferredReplayTarget.safeParse(value).success;

export const createCoreHatchetTasks = (hatchet: HatchetClient) => {
  const agentStep = hatchet.task({
    name: HATCHET_TASK_NAMES.agentStep,
    backoff: { factor: 2, maxSeconds: 300 },
    concurrency: {
      expression: 'input.operationId',
      limitStrategy: ConcurrencyLimitStrategy.GROUP_ROUND_ROBIN,
      maxRuns: 1,
    },
    executionTimeout: '15m',
    fn: async (input: HatchetAgentStepInput & InputType, context) => {
      const retryCount = context.retryCount();
      const response = await runStep(
        createRunStepContext(input, retryCount, context.workflowRunId()),
      );
      const body = await readResponseBody(response);
      if (!response.ok) throwDeliveryFailure(input, retryCount, response.status, body);
      return body;
    },
    idempotency: {
      expression: 'input.deduplicationKey',
      fallbackTtlMs: 24 * 60 * 60 * 1000,
      strategy: 'status',
    },
    inputValidator: agentStepInput,
    retries: 12,
  });

  const agentSignalNightlySchedule = hatchet.task({
    name: HATCHET_TASK_NAMES.agentSignalNightlySchedule,
    executionTimeout: '15m',
    fn: async () => runScheduleNightlyReview(),
    onCrons: ['0 * * * *'],
    retries: 3,
  });

  const botReplay = hatchet.task({
    name: HATCHET_TASK_NAMES.botReplay,
    backoff: { factor: 2, maxSeconds: 60 },
    executionTimeout: '15m',
    fn: async (input: HatchetAgentStepInput & InputType) => {
      if (!isDeferredReplayTarget(input.payload)) {
        throw new NonRetryableError('Invalid deferred replay payload');
      }
      await runDeferredReplay(input.payload);
      return { success: true };
    },
    idempotency: {
      expression: 'input.deduplicationKey',
      fallbackTtlMs: 24 * 60 * 60 * 1000,
      strategy: 'status',
    },
    inputValidator: agentStepInput,
    retries: 8,
  });

  const goalAdvance = hatchet.task({
    name: HATCHET_TASK_NAMES.goalAdvance,
    backoff: { factor: 2, maxSeconds: 300 },
    concurrency: {
      expression: 'input.goalId',
      limitStrategy: ConcurrencyLimitStrategy.GROUP_ROUND_ROBIN,
      maxRuns: 1,
    },
    executionTimeout: '15m',
    fn: async (input: GoalAdvanceInput & InputType) => {
      await advanceGoal(input);
      return { success: true };
    },
    inputValidator: goalAdvanceInput,
    retries: 5,
  });

  const taskHeartbeat = hatchet.task({
    name: HATCHET_TASK_NAMES.taskHeartbeat,
    backoff: { factor: 2, maxSeconds: 300 },
    concurrency: {
      expression: 'input.taskId',
      limitStrategy: ConcurrencyLimitStrategy.GROUP_ROUND_ROBIN,
      maxRuns: 1,
    },
    executionTimeout: '15m',
    fn: async ({ taskId, tickToken, userId }: TaskHeartbeatInput & InputType) => {
      await runHeartbeatTick(taskId, userId, tickToken);
      return { success: true };
    },
    inputValidator: taskHeartbeatInput,
    retries: 5,
  });

  const taskScheduleExecute = hatchet.task({
    name: HATCHET_TASK_NAMES.taskScheduleExecute,
    backoff: { factor: 2, maxSeconds: 300 },
    executionTimeout: '15m',
    fn: async ({ taskId, tickToken, userId }: TaskHeartbeatInput & InputType) =>
      runScheduleTick(taskId, userId, tickToken),
    inputValidator: taskScheduleExecuteInput,
    retries: 5,
  });

  const taskScheduleDispatch = hatchet.task({
    name: HATCHET_TASK_NAMES.taskScheduleDispatch,
    executionTimeout: '15m',
    fn: async () => runScheduleDispatch(),
    onCrons: ['*/10 * * * *'],
    retries: 3,
  });

  const taskScheduledTopicDispatch = hatchet.task({
    name: HATCHET_TASK_NAMES.taskScheduledTopicDispatch,
    executionTimeout: '15m',
    fn: async () => runInternalHandler(scheduledTopicDispatch),
    onCrons: ['*/10 * * * *'],
    retries: 3,
  });

  const taskWatchdog = hatchet.task({
    name: HATCHET_TASK_NAMES.taskWatchdog,
    executionTimeout: '15m',
    fn: async () => runInternalHandler(watchdog),
    onCrons: ['*/5 * * * *'],
    retries: 3,
  });

  const verifySweep = hatchet.task({
    name: HATCHET_TASK_NAMES.verifySweep,
    executionTimeout: '15m',
    fn: async () => runInternalHandler(verifySweepHandler),
    onCrons: ['*/5 * * * *'],
    retries: 3,
  });

  const goalSweep = hatchet.task({
    name: HATCHET_TASK_NAMES.goalSweep,
    executionTimeout: '15m',
    fn: async () => runGoalSweep(),
    onCrons: ['*/5 * * * *'],
    retries: 3,
  });

  const linearSyncSweep = hatchet.task({
    name: HATCHET_TASK_NAMES.linearSyncSweep,
    executionTimeout: '15m',
    fn: async () => runInternalHandler(linearSyncSweepHandler),
    onCrons: ['* * * * *'],
    retries: 3,
  });

  return [
    agentStep,
    agentSignalNightlySchedule,
    botReplay,
    goalAdvance,
    goalSweep,
    linearSyncSweep,
    taskHeartbeat,
    taskScheduleDispatch,
    taskScheduleExecute,
    taskScheduledTopicDispatch,
    taskWatchdog,
    verifySweep,
  ];
};

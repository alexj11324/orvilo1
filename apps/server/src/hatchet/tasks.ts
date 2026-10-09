import {
  ConcurrencyLimitStrategy,
  type HatchetClient,
  type InputType,
  type JsonObject,
} from '@hatchet-dev/typescript-sdk/v1/index.js';
import type { GoalAdvanceTrigger } from '@orvilo/agent-tracing';
import type { Context as HonoContext } from 'hono';
import { z } from 'zod';

import { runScheduleNightlyReview } from '@/server/router-hono/workflows/agent-signal/handlers/scheduleNightlyReview';
import { runGoalSweep } from '@/server/router-hono/workflows/goal/handlers/sweep';
import { sweep as linearSyncSweepHandler } from '@/server/router-hono/workflows/linear-sync/handlers/sweep';
import { runScheduleDispatch } from '@/server/router-hono/workflows/task/handlers/scheduleDispatch';
import { scheduledTopicDispatch } from '@/server/router-hono/workflows/task/handlers/scheduledTopicDispatch';
import { watchdog } from '@/server/router-hono/workflows/task/handlers/watchdog';
import { sweep as verifySweepHandler } from '@/server/router-hono/workflows/verify/handlers/sweep';
import { advanceGoal } from '@/server/services/goal/advanceGoal';
import { HATCHET_TASK_NAMES } from '@/server/services/hatchet/taskNames';
import { runMcpEventInboxSweep } from '@/server/services/mcpEvents/runtime';
import { runTaskIssueRecurrenceSweep } from '@/server/services/taskIssueRecurrence/sweep';
import { runTaskReminderSweep } from '@/server/services/taskReminder/sweep';
import { runHeartbeatTick } from '@/server/services/taskRunner/heartbeatTick';
import { runScheduleTick } from '@/server/services/taskRunner/scheduleTick';
import { TASK_WATCHDOG_CRON } from '@/server/services/taskWatchdogSchedule';

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

export const createCoreHatchetTasks = (hatchet: HatchetClient) => {
  const agentSignalNightlySchedule = hatchet.task({
    name: HATCHET_TASK_NAMES.agentSignalNightlySchedule,
    executionTimeout: '15m',
    fn: async () => runScheduleNightlyReview(),
    onCrons: ['0 * * * *'],
    retries: 3,
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
    onCrons: [TASK_WATCHDOG_CRON],
    retries: 3,
  });

  // Immediate ingress wakes this durable task. The independent minute cron
  // recovers committed receipts after a crash or a failed wake-up enqueue.
  const mcpEventInboxSweep = hatchet.task({
    name: HATCHET_TASK_NAMES.mcpEventInboxSweep,
    backoff: { factor: 2, maxSeconds: 60 },
    concurrency: {
      expression: '"mcp-event-inbox"',
      limitStrategy: ConcurrencyLimitStrategy.GROUP_ROUND_ROBIN,
      maxRuns: 4,
    },
    executionTimeout: '15m',
    fn: async () => runMcpEventInboxSweep(),
    onCrons: ['* * * * *'],
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

  const taskReminderSweep = hatchet.task({
    name: HATCHET_TASK_NAMES.taskReminderSweep,
    executionTimeout: '5m',
    fn: async () => {
      const [reminders, issueRecurrences] = await Promise.all([
        runTaskReminderSweep(),
        runTaskIssueRecurrenceSweep(),
      ]);
      return { ...reminders, issueRecurrences };
    },
    onCrons: ['* * * * *'],
    retries: 3,
  });

  return [
    agentSignalNightlySchedule,
    goalAdvance,
    goalSweep,
    linearSyncSweep,
    mcpEventInboxSweep,
    taskHeartbeat,
    taskReminderSweep,
    taskScheduleDispatch,
    taskScheduleExecute,
    taskScheduledTopicDispatch,
    taskWatchdog,
    verifySweep,
  ];
};

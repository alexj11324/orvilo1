import {
  HatchetClient,
  IdempotencyCollisionError,
  type InputType,
  Priority,
  type RunOpts,
} from '@hatchet-dev/typescript-sdk/v1/index.js';

const HATCHET_RUN_PREFIX = 'hatchet-run:';
const HATCHET_SCHEDULE_PREFIX = 'hatchet-schedule:';
const DEFAULT_GRPC_MESSAGE_BYTES = 16 * 1024 * 1024;

let cachedClient: HatchetClient | undefined;

const resolveGrpcMessageBytes = () => {
  const configured = Number(process.env.HATCHET_GRPC_MAX_MESSAGE_BYTES);
  return Number.isSafeInteger(configured) && configured > 0
    ? configured
    : DEFAULT_GRPC_MESSAGE_BYTES;
};

export const getHatchetClient = (): HatchetClient => {
  if (cachedClient) return cachedClient;

  const token = process.env.HATCHET_CLIENT_TOKEN;
  if (!token) {
    throw new Error('HATCHET_CLIENT_TOKEN is required when AGENT_RUNTIME_MODE=queue');
  }

  const maxMessageBytes = resolveGrpcMessageBytes();
  cachedClient = HatchetClient.init({
    grpc_max_recv_message_length: maxMessageBytes,
    grpc_max_send_message_length: maxMessageBytes,
    token,
  });

  return cachedClient;
};

export const resetHatchetClientForTests = (): void => {
  cachedClient = undefined;
};

const toHatchetPriority = (priority: 'high' | 'low' | 'normal' | undefined) => {
  switch (priority) {
    case 'high': {
      return Priority.HIGH;
    }
    case 'low': {
      return Priority.LOW;
    }
    default: {
      return Priority.MEDIUM;
    }
  }
};

interface EnqueueHatchetTaskOptions {
  delayMs?: number;
  priority?: 'high' | 'low' | 'normal';
}

export const enqueueHatchetTask = async <T extends object>(
  taskName: string,
  input: T,
  options: EnqueueHatchetTaskOptions = {},
): Promise<string> => {
  const client = getHatchetClient();
  const runOptions: RunOpts = { priority: toHatchetPriority(options.priority) };
  const delayMs = Math.max(0, options.delayMs ?? 0);

  if (delayMs > 0) {
    const scheduled = await client.scheduled.create(taskName, {
      input: input as InputType,
      priority: runOptions.priority,
      triggerAt: new Date(Date.now() + delayMs),
    });
    return `${HATCHET_SCHEDULE_PREFIX}${scheduled.metadata.id}`;
  }

  try {
    const run = await client.runNoWait(taskName, input as InputType, runOptions);
    return `${HATCHET_RUN_PREFIX}${await run.getWorkflowRunId()}`;
  } catch (error) {
    // Hatchet accepted the original task, but the caller can lose its receipt
    // before persisting it. A replay returns the accepted run's external id;
    // use that as the missing receipt so the database row can leave pending.
    if (error instanceof IdempotencyCollisionError && error.existingRunExternalId) {
      return `${HATCHET_RUN_PREFIX}${error.existingRunExternalId}`;
    }
    throw error;
  }
};

export const cancelHatchetTask = async (taskId: string): Promise<void> => {
  const client = getHatchetClient();

  if (taskId.startsWith(HATCHET_SCHEDULE_PREFIX)) {
    await client.scheduled.delete(taskId.slice(HATCHET_SCHEDULE_PREFIX.length));
    return;
  }

  if (taskId.startsWith(HATCHET_RUN_PREFIX)) {
    await client.runs.cancel({ ids: [taskId.slice(HATCHET_RUN_PREFIX.length)] });
    return;
  }

  throw new Error(`Unknown Hatchet task id: ${taskId}`);
};

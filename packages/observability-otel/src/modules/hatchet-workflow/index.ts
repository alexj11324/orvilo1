import { metrics, trace } from '@opentelemetry/api';
import { errorNameFrom } from '@orvilo/utils';

const meter = metrics.getMeter('server-services-hatchet-workflow');
export const tracer = trace.getTracer('@orvilo/hatchet-workflow', '0.0.1');

export const ATTR_HATCHET_WORKFLOW_OPERATION = 'hatchet_workflow_operation' as const;
export const ATTR_HATCHET_WORKFLOW_STATUS = 'hatchet_workflow_status' as const;
export const ATTR_HATCHET_WORKFLOW_INTERFACE = 'hatchet_workflow_interface' as const;
export const ATTR_HATCHET_WORKFLOW_URL = 'hatchet_workflow_url' as const;
export const ATTR_HATCHET_WORKFLOW_PATH = 'hatchet_workflow_path' as const;
export const ATTR_HATCHET_WORKFLOW_RETRY_COUNT = 'hatchet_workflow_retries' as const;
export const ATTR_HATCHET_WORKFLOW_RETRY_DELAY = 'hatchet_workflow_retry_delay' as const;
export const ATTR_HATCHET_WORKFLOW_ERROR_TYPE = 'hatchet_workflow_error_type' as const;

/**
 * Count Hatchet workflow lifecycle events.
 *
 * Use when:
 * - Tracking workflow trigger, step, invoke, and serve volumes
 * - Comparing workflow dispatches with worker deliveries
 *
 * Expects:
 * - Low-cardinality labels such as operation, status, interface, and route path
 *
 * Returns:
 * - Monotonic event counts exported through the configured OTEL metric reader
 */
export const workflowEventCounter = meter.createCounter('hatchet_workflow_events_total', {
  description: 'Count of Hatchet workflow lifecycle events grouped by operation and status.',
  unit: '{event}',
});

export type HatchetWorkflowOperation = 'invoke' | 'serve' | 'step' | 'trigger';
export type HatchetWorkflowInterface = 'hatchet';
export type HatchetWorkflowStatus = 'abort' | 'error' | 'success';

const HATCHET_WORKFLOW_ABORT_ERROR_TYPES = new Set(['WorkflowAbort', 'WorkflowRetryAfterError']);

export interface HatchetWorkflowContextAttributes {
  failureUrl?: string;
  label?: string;
  retries?: number;
  retryDelay?: string;
  url?: string;
  workflowRunId?: string;
}

export interface HatchetWorkflowMetricAttributes extends HatchetWorkflowContextAttributes {
  errorType?: string;
  interface?: HatchetWorkflowInterface;
  operation: HatchetWorkflowOperation;
  path?: string;
  status: HatchetWorkflowStatus;
  stepName?: string;
}

export interface HatchetWorkflowContextLike<
  TInitialPayload = unknown,
> extends HatchetWorkflowContextAttributes {
  invoke?: <TResult = unknown>(stepName: string, settings: unknown) => Promise<TResult>;
  requestPayload: TInitialPayload;
  run: <TResult>(
    stepName: string,
    stepFunction: () => TResult | Promise<TResult>,
  ) => Promise<TResult | Promise<TResult>>;
}

/**
 * Normalizes workflow URLs into route paths.
 *
 * Before:
 * - "https://app.example.com/api/workflows/task/watchdog"
 *
 * After:
 * - "/api/workflows/task/watchdog"
 */
export const normalizeHatchetWorkflowPath = (url?: string): string | undefined => {
  if (!url) return undefined;

  try {
    return new URL(url).pathname;
  } catch {
    return url.startsWith('/') ? url : undefined;
  }
};

const statusFromHatchetWorkflowError = (error: unknown): HatchetWorkflowStatus =>
  HATCHET_WORKFLOW_ABORT_ERROR_TYPES.has(errorNameFrom(error) ?? '') ? 'abort' : 'error';

/**
 * Builds metric attributes for Hatchet workflow events.
 *
 * Use when:
 * - Recording a workflow lifecycle counter from shared wrappers
 * - Normalizing route URLs into low-cardinality path labels
 *
 * Expects:
 * - `operation` and `status` are present for metric counter events
 * - `url` may be absolute or an already-normalized route path
 * - Per-run identifiers are excluded from metric labels to avoid high-cardinality series
 * - `hatchet_workflow_url` stores the normalized route path, not the absolute URL
 *
 * Returns:
 * - Attribute map accepted by OpenTelemetry metrics APIs
 */
export const buildHatchetWorkflowMetricAttributes = (
  attributes: HatchetWorkflowContextAttributes &
    Partial<Omit<HatchetWorkflowMetricAttributes, keyof HatchetWorkflowContextAttributes>>,
): Record<string, boolean | number | string | undefined> => ({
  [ATTR_HATCHET_WORKFLOW_ERROR_TYPE]: attributes.errorType,
  [ATTR_HATCHET_WORKFLOW_INTERFACE]: attributes.interface,
  [ATTR_HATCHET_WORKFLOW_OPERATION]: attributes.operation,
  [ATTR_HATCHET_WORKFLOW_PATH]: attributes.path ?? normalizeHatchetWorkflowPath(attributes.url),
  [ATTR_HATCHET_WORKFLOW_RETRY_COUNT]: attributes.retries,
  [ATTR_HATCHET_WORKFLOW_RETRY_DELAY]: attributes.retryDelay,
  [ATTR_HATCHET_WORKFLOW_STATUS]: attributes.status,
  [ATTR_HATCHET_WORKFLOW_URL]: attributes.path ?? normalizeHatchetWorkflowPath(attributes.url),
});

/**
 * Records one or more Hatchet workflow lifecycle events.
 *
 * Use when:
 * - A Hatchet workflow trigger is attempted
 * - A workflow task is served by a worker
 * - A workflow step or invoke call is submitted from a context
 *
 * Expects:
 * - `count` is the number of events represented by this observation
 *
 * Returns:
 * - Nothing; the observation is emitted to the active OTEL meter provider
 */
export const recordHatchetWorkflowEvent = (
  attributes: HatchetWorkflowMetricAttributes,
  count = 1,
): void => {
  workflowEventCounter.add(count, buildHatchetWorkflowMetricAttributes(attributes));
};

/**
 * Wraps a workflow context with step and invoke counters.
 *
 * Use when:
 * - Wrapping a workflow route function before passing it to a worker
 * - Counting `context.run(...)` and `context.invoke(...)` calls without editing each step
 *
 * Expects:
 * - Workflow context methods keep their original `this` binding
 *
 * Returns:
 * - The same context instance with wrapped methods
 */
export const withOtelMetricsForHatchetWorkflowContext = <
  TInitialPayload,
  TContext extends HatchetWorkflowContextLike<TInitialPayload>,
>(
  context: TContext,
  baseAttributes?: Partial<HatchetWorkflowContextAttributes>,
): TContext => {
  const originalRun = context.run;

  context.run = (async <TResult>(
    stepName: string,
    stepFunction: () => TResult | Promise<TResult>,
  ): Promise<TResult | Promise<TResult>> => {
    try {
      const result = await (originalRun.call(context, stepName, stepFunction) as Promise<
        TResult | Promise<TResult>
      >);
      recordHatchetWorkflowEvent({
        ...baseAttributes,
        ...context,
        operation: 'step',
        status: 'success',
        stepName,
      });

      return result;
    } catch (error) {
      recordHatchetWorkflowEvent({
        ...baseAttributes,
        ...context,
        errorType: errorNameFrom(error) ?? typeof error,
        operation: 'step',
        status: statusFromHatchetWorkflowError(error),
        stepName,
      });

      throw error;
    }
  }) as TContext['run'];

  if (context.invoke) {
    const originalInvoke = context.invoke;

    context.invoke = (async <TResult = unknown>(
      stepName: string,
      settings: unknown,
    ): Promise<TResult> => {
      try {
        const result = await (originalInvoke.call(context, stepName, settings) as Promise<TResult>);
        recordHatchetWorkflowEvent({
          ...baseAttributes,
          ...context,
          operation: 'invoke',
          status: 'success',
          stepName,
        });

        return result;
      } catch (error) {
        recordHatchetWorkflowEvent({
          ...baseAttributes,
          ...context,
          errorType: errorNameFrom(error) ?? typeof error,
          operation: 'invoke',
          status: statusFromHatchetWorkflowError(error),
          stepName,
        });

        throw error;
      }
    }) as TContext['invoke'];
  }

  return context;
};

/**
 * Wraps a workflow route function with serve, step, and invoke metrics.
 *
 * Use when:
 * - Passing a handler to the durable workflow worker adapter
 * - Counting inbound workflow deliveries and the steps they submit
 *
 * Expects:
 * - The wrapped function receives a standard WorkflowContext-like object
 *
 * Returns:
 * - A route function with the same result contract as the original handler
 */
export const withOtelMetricsForHatchetWorkflows = <TContext, TResult>(
  routeFunction: (context: TContext) => Promise<TResult>,
  baseAttributes?: Partial<HatchetWorkflowContextAttributes>,
) => {
  return async (context: TContext): Promise<TResult> => {
    const instrumentedContext = withOtelMetricsForHatchetWorkflowContext(
      context as TContext & HatchetWorkflowContextLike,
      baseAttributes,
    ) as TContext;

    try {
      const result = await routeFunction(instrumentedContext);
      recordHatchetWorkflowEvent({
        ...baseAttributes,
        ...(context as HatchetWorkflowContextAttributes),
        operation: 'serve',
        status: 'success',
      });

      return result;
    } catch (error) {
      recordHatchetWorkflowEvent({
        ...baseAttributes,
        ...(context as HatchetWorkflowContextAttributes),
        errorType: errorNameFrom(error) ?? typeof error,
        operation: 'serve',
        status: statusFromHatchetWorkflowError(error),
      });

      throw error;
    }
  };
};

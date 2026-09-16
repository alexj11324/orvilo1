/** Provider-neutral workflow surface used by business workflow handlers. */
export interface WorkflowContext<TPayload = Record<string, unknown>> {
  headers?: Headers;
  invoke?: <TResult = unknown>(stepName: string, settings: unknown) => Promise<TResult>;
  requestPayload: TPayload;
  run: <TResult>(name: string, step: () => TResult | Promise<TResult>) => Promise<TResult>;
  workflowRunId?: string;
}

export interface WorkflowStepStore {
  /** Step callbacks remain at-least-once if the worker dies before completion is persisted. */
  acquire: (
    stepName: string,
    ownerToken: string,
  ) => Promise<
    | { status: 'acquired' }
    | { result: unknown; resultIsUndefined: boolean; status: 'completed' }
    | { status: 'busy' }
  >;
  complete: (stepName: string, ownerToken: string, result: unknown) => Promise<void>;
  ownerToken?: string;
  release: (stepName: string, ownerToken: string) => Promise<void>;
  renew: (stepName: string, ownerToken: string) => Promise<boolean>;
}

export class WorkflowAbort extends Error {}

export class WorkflowNonRetryableError extends Error {}

export class WorkflowStepInProgressError extends Error {
  constructor(stepName: string) {
    super(`Workflow step is already running: ${stepName}`);
    this.name = 'WorkflowStepInProgressError';
  }
}

const WORKFLOW_STEP_LEASE_HEARTBEAT_MS = 15_000;
const MAX_WORKFLOW_STEP_NAME_LENGTH = 256;

const jsonRoundTrip = <T>(value: T): T => {
  if (value === undefined) return value;
  // JSON persistence deliberately matches the old workflow boundary (not structuredClone):
  // Dates become ISO strings and unsupported values are dropped before a later step consumes them.
  // eslint-disable-next-line unicorn/prefer-structured-clone
  return JSON.parse(JSON.stringify(value)) as T;
};

export const createWorkflowContext = <TPayload>(
  payload: TPayload,
  headers?: Record<string, string>,
  workflowRunId?: string,
  options?: { ownerToken?: string; stepStore?: WorkflowStepStore },
): WorkflowContext<TPayload> => ({
  headers: headers ? new Headers(headers) : undefined,
  requestPayload: payload,
  run: async <TResult>(name: string, step: () => TResult | Promise<TResult>) => {
    if (name.length > MAX_WORKFLOW_STEP_NAME_LENGTH) {
      throw new WorkflowNonRetryableError(
        `Workflow step name exceeds ${MAX_WORKFLOW_STEP_NAME_LENGTH} characters`,
      );
    }

    const stepStore = options?.stepStore;
    if (!stepStore) return jsonRoundTrip(await step());

    const ownerToken =
      options.ownerToken ?? stepStore.ownerToken ?? workflowRunId ?? 'local-workflow';
    const claim = await stepStore.acquire(name, ownerToken);
    if (claim.status === 'completed') {
      return (claim.resultIsUndefined ? undefined : claim.result) as TResult;
    }
    if (claim.status === 'busy') throw new WorkflowStepInProgressError(name);

    const heartbeat = setInterval(() => {
      void stepStore
        .renew(name, ownerToken)
        .then((renewed) => {
          if (!renewed) {
            console.error('[workflow] step lease ownership was lost', { name, ownerToken });
          }
        })
        .catch((error) => {
          console.error('[workflow] failed to renew step lease', { name, ownerToken, error });
        });
    }, WORKFLOW_STEP_LEASE_HEARTBEAT_MS);

    try {
      const result = jsonRoundTrip(await step());
      await stepStore.complete(name, ownerToken, result);
      return result;
    } catch (error) {
      await stepStore.release(name, ownerToken).catch((releaseError) => {
        console.error('[workflow] failed to release step lease after failure', {
          name,
          ownerToken,
          releaseError,
        });
      });
      throw error;
    } finally {
      clearInterval(heartbeat);
    }
  },
  workflowRunId,
});

/** Provider-neutral workflow surface used by business workflow handlers. */
export interface WorkflowContext<TPayload = Record<string, unknown>> {
  headers?: Headers;
  invoke?: <TResult = unknown>(stepName: string, settings: unknown) => Promise<TResult>;
  requestPayload: TPayload;
  run: <TResult>(name: string, step: () => TResult | Promise<TResult>) => Promise<TResult>;
  workflowRunId?: string;
}

export class WorkflowAbort extends Error {}

export class WorkflowNonRetryableError extends Error {}

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
): WorkflowContext<TPayload> => ({
  headers: headers ? new Headers(headers) : undefined,
  requestPayload: payload,
  run: async (_name, step) => jsonRoundTrip(await step()),
  workflowRunId,
});

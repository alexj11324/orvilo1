import { isRecord } from '@orvilo/utils/object';

import type { AgentStreamEvent } from '../spawn';
import { classifyHeteroProcessFailure, isHeteroStatusGuideErrorData } from '../spawn';

/**
 * Patterns that indicate a resumed run (ACP `session/resume` / `session/load`)
 * should be retried without resuming. Two classes of failure:
 *
 *   1. Session file missing (sandbox recycled): the stored session id is stale.
 *   2. Context overflow (long conversation): the resumed history no longer fits
 *      the model's context window; starting fresh drops it.
 *
 * Checked against `error` stream events and, as a fallback, the agent's stderr.
 */
export const RESUME_RETRY_PATTERNS = [
  // Session file missing — sandbox was recycled
  /no conversation found/i,
  /session.*not found/i,
  /conversation.*not found/i,
  /resume.*not found/i,
  // Context overflow — API rejected the resumed session's accumulated history
  /prompt.*too long/i,
  /context.*too long/i,
  /context window.*exceed/i,
  /maximum.*context.*length/i,
] as const;

export const looksLikeNeedsRetryWithoutResume = (text: string): boolean =>
  RESUME_RETRY_PATTERNS.some((p) => p.test(text));

export const isMissingGrokResumeSession = (data: Record<string, unknown> | undefined): boolean => {
  if (data?.agentType !== 'grok-build' || !isRecord(data.details)) return false;
  const { details } = data;
  const rpcData = details.data;
  return details.method === 'session/load' && isRecord(rpcData) && rpcData.code === 'FS_NOT_FOUND';
};

/** The `error` payload of a `heteroFinish` receipt. */
export interface HeteroFinishError {
  body?: Record<string, unknown>;
  message: string;
  type: string;
}

/**
 * Build the `finish` error payload. Process-level failures the agent never got
 * to report in-stream (CLI missing, auth printed to stderr) are classified into
 * the structured status-guide shape and attached as `body`, typed
 * `AgentRuntimeError`; unclassifiable failures keep the flat `{ message, type }`.
 */
export const buildHeteroFinishError = (
  params: { agentType: string; command?: string },
  message: string,
  type: string,
  errnoCode?: string,
): HeteroFinishError => {
  const classified = classifyHeteroProcessFailure({
    agentType: params.agentType,
    command: params.command,
    detail: message,
    errnoCode,
  });
  if (!classified) return { message, type };
  return { body: { ...classified }, message: classified.message, type: 'AgentRuntimeError' };
};

export interface TurnEventSummary {
  /** A resume failure was intercepted (and withheld from `onEvent`). */
  resumeNotFound: boolean;
  /** A terminal `error` event was forwarded. */
  sawTerminalError: boolean;
  /** The adapter's already-classified status-guide payload of that error, if any. */
  terminalErrorData: Record<string, unknown> | undefined;
  terminalErrorMessage: string | undefined;
}

/**
 * Drain one turn's events. With `interceptResumeErrors`, an `error` event that
 * says the resumed session is unusable goes to `onWithheld` instead of
 * `onEvent`, so the server never sees a terminal error before the fresh retry.
 * Iterator failures (spawn ENOENT surfaced through the stream) propagate.
 */
export const consumeTurnEvents = async (
  events: AsyncIterable<AgentStreamEvent>,
  {
    interceptResumeErrors,
    onEvent,
    onWithheld,
  }: {
    interceptResumeErrors: boolean;
    onEvent: (event: AgentStreamEvent) => void;
    onWithheld?: (event: AgentStreamEvent) => void;
  },
): Promise<TurnEventSummary> => {
  const summary: TurnEventSummary = {
    resumeNotFound: false,
    sawTerminalError: false,
    terminalErrorData: undefined,
    terminalErrorMessage: undefined,
  };
  for await (const event of events) {
    if (interceptResumeErrors && event.type === 'error') {
      const data = event.data as Record<string, unknown> | undefined;
      const msg = String(data?.message ?? data?.error ?? '');
      if (looksLikeNeedsRetryWithoutResume(msg) || isMissingGrokResumeSession(data)) {
        summary.resumeNotFound = true;
        onWithheld?.(event);
        continue;
      }
    }
    // A terminal error (e.g. an API/rate-limit error relayed in-stream) fails
    // the run even when the agent exits cleanly.
    if (event.type === 'error') {
      summary.sawTerminalError = true;
      const data = event.data as Record<string, unknown> | undefined;
      summary.terminalErrorMessage = String(data?.message ?? data?.error ?? '') || undefined;
      summary.terminalErrorData = isHeteroStatusGuideErrorData(data) ? data : undefined;
    }
    onEvent(event);
  }
  return summary;
};

/**
 * Derive the finish `result` and `error` of a turn from the same signals the
 * CLI and the desktop in-process runner both observe.
 */
export const deriveTurnOutcome = (
  params: { agentType: string; command?: string },
  turn: {
    cancelled: boolean;
    code: number | null;
    ingestError: boolean;
    sawTerminalError: boolean;
    signal: NodeJS.Signals | null;
    stderrContent: string;
    terminalErrorData: Record<string, unknown> | undefined;
    terminalErrorMessage: string | undefined;
  },
): { error: HeteroFinishError | undefined; result: 'cancelled' | 'error' | 'success' } => {
  const exitedClean =
    !turn.cancelled &&
    !turn.ingestError &&
    !turn.sawTerminalError &&
    (turn.code === 0 || turn.signal === 'SIGTERM');

  // Prefer the in-stream terminal error (relayed while exiting 0); otherwise
  // the stderr tail, trimmed to its last 1 KB.
  const errorDetail = turn.terminalErrorMessage || turn.stderrContent.trim();
  const error =
    turn.cancelled || exitedClean
      ? undefined
      : turn.terminalErrorData
        ? {
            body: { ...turn.terminalErrorData },
            message: String(turn.terminalErrorData.message ?? errorDetail ?? ''),
            type: 'AgentRuntimeError',
          }
        : errorDetail
          ? buildHeteroFinishError(params, errorDetail.slice(-1024), 'AgentRuntimeError')
          : undefined;

  return { error, result: turn.cancelled ? 'cancelled' : exitedClean ? 'success' : 'error' };
};

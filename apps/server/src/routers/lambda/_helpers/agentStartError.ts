import { TRPCError } from '@trpc/server';

import { type AgentStartDenial, AgentStartError } from '@/server/services/agentExecution/types';

/**
 * Public status code for each start-intent denial. A rejected start is a
 * statement about the request, not a server fault, so none of these may
 * surface as a 500.
 */
const AGENT_START_DENIAL_CODES: Record<AgentStartDenial, TRPCError['code']> = {
  deferred_start_unsupported: 'BAD_REQUEST',
  never_dispatched: 'PRECONDITION_FAILED',
  not_found: 'NOT_FOUND',
  terminal: 'CONFLICT',
};

/**
 * Maps a start-intent contract failure to its public tRPC representation.
 *
 * Use when:
 * - A procedure accepts an operation start intent (`aiAgent.startExecution`)
 *   or a run request carrying the retired deferred-start flag
 *   (`execAgent`/`execAgents` with `autoStart:false`)
 *
 * Expects:
 * - An error caught from the start path, including an existing tRPC error
 *
 * Returns:
 * - The original tRPC error, a contract-aware tRPC error retaining the
 *   original cause, or the error unchanged when it is not a start contract
 *   failure
 */
export const mapAgentStartTRPCError = (error: unknown): unknown => {
  if (error instanceof TRPCError) return error;
  if (!(error instanceof AgentStartError)) return error;

  return new TRPCError({
    cause: error,
    code: AGENT_START_DENIAL_CODES[error.denial],
    message: error.message,
  });
};

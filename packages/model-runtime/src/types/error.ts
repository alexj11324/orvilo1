import type { IOrviloAgentRuntimeErrorType } from '@orvilo/types';
import { AgentRuntimeErrorType } from '@orvilo/types';

export const AGENT_RUNTIME_ERROR_SET = new Set<string>(Object.values(AgentRuntimeErrorType));

export const StandardErrorType = {
  // ******* Client Error ******* //
  BadRequest: 400,
  Unauthorized: 401,
  Forbidden: 403,
  ContentNotFound: 404,
  MethodNotAllowed: 405,
  TooManyRequests: 429,

  // ******* Server Error ******* //
  InternalServerError: 500,
  BadGateway: 502,
  ServiceUnavailable: 503,
  GatewayTimeout: 504,
} as const;

export type ErrorType = (typeof StandardErrorType)[keyof typeof StandardErrorType];

/**
 * Chat message error object
 */
export interface ChatMessageError {
  body?: any;
  message: string;
  type: ErrorType | IOrviloAgentRuntimeErrorType;
}

export type { IOrviloAgentRuntimeErrorType } from '@orvilo/types';
export { AgentRuntimeErrorType } from '@orvilo/types';

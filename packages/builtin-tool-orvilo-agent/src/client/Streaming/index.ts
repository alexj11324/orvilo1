import type { BuiltinStreaming } from '@orvilo/types';

import { OrviloAgentApiName } from '../../types';
import { CallSubAgentStreaming } from './CallSubAgent';
import { CreatePlanStreaming } from './CreatePlan';

/**
 * Orvilo Agent Streaming Components Registry
 *
 * Streaming components render tool calls while they are still
 * executing, allowing real-time feedback to users.
 */
export const OrviloAgentStreamings: Record<string, BuiltinStreaming> = {
  [OrviloAgentApiName.callSubAgent]: CallSubAgentStreaming as BuiltinStreaming,
  [OrviloAgentApiName.createPlan]: CreatePlanStreaming as BuiltinStreaming,
};

export { CallSubAgentStreaming } from './CallSubAgent';
export { CreatePlanStreaming } from './CreatePlan';

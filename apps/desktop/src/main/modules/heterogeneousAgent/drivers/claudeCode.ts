import {
  sanitizeClaudeCodeDirectArgs,
  sanitizeClaudeCodeDirectEnv,
} from '@orvilo/heterogeneous-agents';
import { formatServerDefaultHeterogeneousModel } from '@orvilo/types';

import type { HeterogeneousAgentDriver } from '../types';

export const claudeCodeDriver: HeterogeneousAgentDriver = {
  prepareServerDefaultBinding({ args, endpoint, env, model, profileDir }) {
    const requestModel = formatServerDefaultHeterogeneousModel(model);
    return {
      args: [...sanitizeClaudeCodeDirectArgs(args), '--model', requestModel],
      env: {
        ...sanitizeClaudeCodeDirectEnv(env),
        ANTHROPIC_BASE_URL: `${endpoint}/api/v1/anthropic`,
        ANTHROPIC_MODEL: requestModel,
        ANTHROPIC_SMALL_FAST_MODEL: requestModel,
        CLAUDE_CODE_SUBAGENT_MODEL: requestModel,
        CLAUDE_CONFIG_DIR: profileDir,
      },
      operationTokenEnvKey: 'ANTHROPIC_AUTH_TOKEN',
    };
  },
};

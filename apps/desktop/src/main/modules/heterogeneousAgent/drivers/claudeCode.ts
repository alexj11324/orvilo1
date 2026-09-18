import {
  buildClaudeCodeDirectEnv,
  sanitizeClaudeCodeDirectArgs,
  sanitizeClaudeCodeDirectEnv,
} from '@orvilo/heterogeneous-agents';
import { formatServerDefaultHeterogeneousModel } from '@orvilo/types';

import type { HeterogeneousAgentDriver } from '../types';

export const claudeCodeDriver: HeterogeneousAgentDriver = {
  prepareProviderBinding({ args, env, profileDir, resolution }) {
    if (resolution.protocol !== 'anthropic-messages') {
      throw new Error(`Claude Code cannot use ${resolution.protocol}.`);
    }

    const direct = buildClaudeCodeDirectEnv({
      keyVaults: resolution.runtimeConfig.keyVaults,
      model: resolution.apiConfig.model,
      sdkType: resolution.runtimeConfig.settings.sdkType,
      smallFastModel: resolution.apiConfig.smallFastModel,
    });
    if (direct.error) throw new Error(direct.error);

    return {
      args: [...sanitizeClaudeCodeDirectArgs(args), '--model', resolution.apiConfig.model],
      env: {
        ...sanitizeClaudeCodeDirectEnv(env),
        ...direct.env,
        CLAUDE_CONFIG_DIR: profileDir,
      },
    };
  },
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

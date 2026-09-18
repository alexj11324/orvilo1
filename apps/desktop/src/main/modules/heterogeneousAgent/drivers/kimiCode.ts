import { formatServerDefaultHeterogeneousModel } from '@orvilo/types';

import type { HeterogeneousAgentDriver } from '../types';

const KIMI_CODE_PROVIDER_BINDING_ENV_KEYS = [
  'KIMI_CODE_HOME',
  'KIMI_MODEL_API_KEY',
  'KIMI_MODEL_BASE_URL',
  'KIMI_MODEL_NAME',
  'KIMI_MODEL_PROVIDER_TYPE',
] as const;

const sanitizeKimiCodeProviderBindingArgs = (source: string[]): string[] => {
  const args: string[] = [];
  for (let index = 0; index < source.length; index += 1) {
    const arg = source[index];
    if (['--continue', '-c', '-C'].includes(arg)) continue;

    if (arg === '--model' || arg === '-m') {
      index += 1;
      continue;
    }
    if (
      arg.startsWith('--model=') ||
      (arg.startsWith('-m') && !arg.startsWith('--') && arg.length > 2)
    )
      continue;

    if (['--resume', '--session', '-r', '-S'].includes(arg)) {
      if (source[index + 1] && !source[index + 1].startsWith('-')) index += 1;
      continue;
    }
    if (
      arg.startsWith('--resume=') ||
      arg.startsWith('--session=') ||
      ((arg.startsWith('-r') || arg.startsWith('-S')) && !arg.startsWith('--') && arg.length > 2)
    )
      continue;
    args.push(arg);
  }
  return args;
};

const sanitizeKimiCodeProviderBindingEnv = (source: Record<string, string> | undefined) => {
  const env = { ...source };
  for (const key of KIMI_CODE_PROVIDER_BINDING_ENV_KEYS) delete env[key];
  return env;
};

export const kimiCodeDriver: HeterogeneousAgentDriver = {
  prepareServerDefaultBinding({ args, endpoint, env, model, profileDir }) {
    const requestModel = formatServerDefaultHeterogeneousModel(model);
    return {
      args: sanitizeKimiCodeProviderBindingArgs(args),
      env: {
        ...sanitizeKimiCodeProviderBindingEnv(env),
        KIMI_CODE_HOME: profileDir,
        KIMI_MODEL_BASE_URL: `${endpoint}/api/v1/anthropic`,
        KIMI_MODEL_NAME: requestModel,
        KIMI_MODEL_PROVIDER_TYPE: 'anthropic',
      },
      operationTokenEnvKey: 'KIMI_MODEL_API_KEY',
    };
  },
};

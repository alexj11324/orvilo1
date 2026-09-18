import { formatServerDefaultHeterogeneousModel } from '@orvilo/types';

import type { HeterogeneousAgentDriver } from '../types';

const HOST_API_KEY_ENV = 'ORVILO_PI_API_KEY';
const MODELS_FILE = 'models.json';
const DEFAULT_CONTEXT_WINDOW = 128_000;
const DEFAULT_MAX_TOKENS = 16_384;

const CONTROLLED_FLAGS = [
  '--api-key',
  '--fork',
  '--model',
  '--models',
  '--provider',
  '--session',
  '--session-dir',
  '--session-id',
] as const;

const CONTROLLED_BOOLEAN_FLAGS = ['--continue', '-c', '--no-session', '--resume', '-r'] as const;

export const sanitizePiProviderBindingArgs = (source: string[]): string[] => {
  const args: string[] = [];
  for (let index = 0; index < source.length; index += 1) {
    const arg = source[index];
    const controlledFlag = CONTROLLED_FLAGS.find(
      (flag) => arg === flag || arg.startsWith(`${flag}=`),
    );
    if (controlledFlag) {
      if (arg === controlledFlag) index += 1;
      continue;
    }
    // Provider-bound sessions are selected exclusively by Desktop. Caller
    // config cannot continue, resume, fork, replace, or disable that session.
    if (CONTROLLED_BOOLEAN_FLAGS.includes(arg as (typeof CONTROLLED_BOOLEAN_FLAGS)[number]))
      continue;
    args.push(arg);
  }
  return args;
};

const sanitizePiProviderBindingEnv = (source: Record<string, string> | undefined) => {
  const env = { ...source };
  delete env[HOST_API_KEY_ENV];
  delete env.PI_CODING_AGENT_DIR;
  delete env.PI_CODING_AGENT_SESSION_DIR;
  return env;
};

export const piDriver: HeterogeneousAgentDriver = {
  prepareServerDefaultBinding({ args, endpoint, env, model, profileDir }) {
    const providerId = 'orvilo-server-default';
    const requestModel = formatServerDefaultHeterogeneousModel(model);
    const modelsConfig = {
      providers: {
        [providerId]: {
          api: 'openai-responses',
          apiKey: `$${HOST_API_KEY_ENV}`,
          baseUrl: `${endpoint}/api/v1/openai/v1`,
          models: [
            {
              contextWindow: DEFAULT_CONTEXT_WINDOW,
              cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0 },
              id: requestModel,
              input: ['text'],
              maxTokens: DEFAULT_MAX_TOKENS,
              name: model,
              reasoning: false,
            },
          ],
          name: 'Orvilo Server Default',
        },
      },
    };

    return {
      args: [
        '--provider',
        providerId,
        '--model',
        requestModel,
        ...sanitizePiProviderBindingArgs(args),
      ],
      env: {
        ...sanitizePiProviderBindingEnv(env),
        PI_CODING_AGENT_DIR: profileDir,
      },
      operationTokenEnvKey: HOST_API_KEY_ENV,
      profileFiles: [{ content: `${JSON.stringify(modelsConfig, null, 2)}\n`, path: MODELS_FILE }],
    };
  },
};

import { createHash } from 'node:crypto';

import { formatServerDefaultHeterogeneousModel } from '@orvilo/types';

import type { HeterogeneousAgentDriver } from '../types';

const HOST_API_KEY_ENV = 'ORVILO_GROK_API_KEY';
const HOST_MODEL_ALIAS_PREFIX = 'orvilo-provider';

const GROK_PROVIDER_BINDING_VALUE_FLAGS = [
  '-m',
  '--agent',
  '--agent-profile',
  '--model',
  '--resume',
  '--session-id',
] as const;

const GROK_PROVIDER_BINDING_BOOLEAN_FLAGS = ['-c', '--continue'] as const;

const GROK_PROVIDER_BINDING_BLOCKED_ENV = [
  'GROK_AGENT',
  'GROK_CONFIG',
  'GROK_CONFIG_PATH',
  'GROK_DEFAULT_MODEL',
] as const;

const tomlString = (value: string): string => JSON.stringify(value);

const stripTrailingSlashes = (value: string): string => {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 47) end -= 1;
  return value.slice(0, end);
};

const buildModelAlias = (identity: string): string =>
  `${HOST_MODEL_ALIAS_PREFIX}-${createHash('sha256').update(identity).digest('hex').slice(0, 16)}`;

export const sanitizeGrokProviderBindingArgs = (source: string[]): string[] => {
  const args: string[] = [];
  for (let index = 0; index < source.length; index += 1) {
    const arg = source[index];
    if (
      GROK_PROVIDER_BINDING_VALUE_FLAGS.includes(
        arg as (typeof GROK_PROVIDER_BINDING_VALUE_FLAGS)[number],
      )
    ) {
      index += 1;
      continue;
    }
    if (
      GROK_PROVIDER_BINDING_BOOLEAN_FLAGS.includes(
        arg as (typeof GROK_PROVIDER_BINDING_BOOLEAN_FLAGS)[number],
      ) ||
      GROK_PROVIDER_BINDING_VALUE_FLAGS.some((flag) => arg.startsWith(`${flag}=`))
    ) {
      continue;
    }
    args.push(arg);
  }
  return args;
};

const sanitizeGrokProviderBindingEnv = (
  source: Record<string, string> | undefined,
): Record<string, string> => {
  const env = { ...source };
  delete env.GROK_HOME;
  delete env[HOST_API_KEY_ENV];
  delete env.GROK_CODE_XAI_API_KEY;
  delete env.XAI_API_KEY;
  // Empty values deliberately shadow variables inherited later by the spawn
  // boundary, keeping model/profile selection inside the managed GROK_HOME.
  for (const key of GROK_PROVIDER_BINDING_BLOCKED_ENV) env[key] = '';
  return env;
};

/**
 * Grok Build executes through `GrokAcpSession`; server-default binding
 * preparation is owned here — its env/profile files flow into the ACP session
 * env.
 */
export const grokBuildDriver: HeterogeneousAgentDriver = {
  prepareServerDefaultBinding({ args, endpoint, env, model, profileDir }) {
    const requestModel = formatServerDefaultHeterogeneousModel(model);
    const alias = buildModelAlias(['server-default', endpoint, model].join('\0'));
    const config = [
      `[model.${alias}]`,
      `name = ${tomlString('Orvilo Server Default')}`,
      `model = ${tomlString(requestModel)}`,
      `base_url = ${tomlString(`${stripTrailingSlashes(endpoint)}/api/v1/openai/v1`)}`,
      `env_key = ${tomlString(HOST_API_KEY_ENV)}`,
      'api_backend = "responses"',
      'auth_scheme = "bearer"',
      '',
      '[models]',
      `default = ${tomlString(alias)}`,
      '',
    ].join('\n');

    return {
      args: [...sanitizeGrokProviderBindingArgs(args), '--model', alias],
      env: {
        ...sanitizeGrokProviderBindingEnv(env),
        GROK_HOME: profileDir,
      },
      operationTokenEnvKey: HOST_API_KEY_ENV,
      profileFiles: [{ content: config, path: 'config.toml' }],
    };
  },
};

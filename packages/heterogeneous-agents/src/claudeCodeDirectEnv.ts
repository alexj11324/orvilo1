export const HETEROGENEOUS_PROVIDER_BINDING_LOCAL_ONLY_ERROR =
  'Heterogeneous agent provider binding is only supported for Desktop local execution.';

/**
 * Desktop main resolves the binding's providerId in the PERSONAL scope only
 * (deliberately no workspace header — see `providerBindingPort`). A workspace
 * agent's binding would have been configured against workspace-scoped
 * providers, so running it locally could silently resolve a personal provider
 * that shares the same id (builtin ids like `anthropic` collide across scopes)
 * and bill the wrong account. Blocked before IPC for every entry point.
 */
export const HETEROGENEOUS_PROVIDER_BINDING_PERSONAL_ONLY_ERROR =
  'Heterogeneous agent provider binding is not supported for workspace agents.';

/** @deprecated Use HETEROGENEOUS_PROVIDER_BINDING_LOCAL_ONLY_ERROR. */
export const CLAUDE_CODE_API_LOCAL_ONLY_ERROR = HETEROGENEOUS_PROVIDER_BINDING_LOCAL_ONLY_ERROR;

const DIRECT_AUTH_ENV_KEYS = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_MODEL',
  'ANTHROPIC_SMALL_FAST_MODEL',
  'CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST',
  'CLAUDE_CODE_SUBPROCESS_ENV_SCRUB',
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_MANTLE',
  'CLAUDE_CODE_USE_VERTEX',
] as const;

/** Remove user-configured auth/model routing before applying a host-managed direct binding. */
export const sanitizeClaudeCodeDirectEnv = (
  source: Record<string, string> | undefined,
): Record<string, string> => {
  const env = { ...source };
  for (const key of DIRECT_AUTH_ENV_KEYS) delete env[key];
  return env;
};

/** Remove persisted model/session overrides before applying a host-authoritative binding. */
export const sanitizeClaudeCodeDirectArgs = (source: string[] | undefined): string[] => {
  const sourceArgs = source ?? [];
  const args: string[] = [];

  for (let index = 0; index < sourceArgs.length; index += 1) {
    const arg = sourceArgs[index];
    if (arg === '--model' || arg === '--resume' || arg === '--session-id') {
      index += 1;
      continue;
    }
    if (
      arg === '--continue' ||
      arg === '-c' ||
      arg.startsWith('--model=') ||
      arg.startsWith('--resume=') ||
      arg.startsWith('--session-id=')
    ) {
      continue;
    }
    args.push(arg);
  }

  return args;
};

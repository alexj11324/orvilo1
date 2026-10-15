import type { HeterogeneousAgentPermission } from '@orvilo/heterogeneous-agents';

const CODEX_REASONING_EFFORT_CONFIG_KEY = 'model_reasoning_effort';
const CODEX_SERVICE_TIER_CONFIG_KEY = 'service_tier';

/** Wrapper flags `orvilo hetero exec` accepts with a value (see `buildHeteroExecArgs`). */
const VALUE_FLAGS: Record<string, keyof ParsedWrapperArgs> = {
  '--acp-permission-id': 'permissionId',
  '--acp-permission-value': 'permissionValue',
  '--command': 'command',
  '--effort': 'effort',
  '--mode': 'mode',
  '--model': 'model',
  '--speed': 'speed',
  '-c': 'command',
};

interface ParsedWrapperArgs {
  agentArgs: string[];
  command?: string;
  effort?: string;
  mode?: string;
  model?: string;
  permissionId?: string;
  permissionValue?: string;
  speed?: string;
}

export interface InProcessAgentArgs {
  /** Vendor command override (`-c, --command`). */
  command?: string;
  /** Native argv for the agent (`--agent-arg` values + translated selectors). */
  extraArgs: string[];
  initialPermission?: HeterogeneousAgentPermission;
}

const parseWrapperArgs = (args: string[]): ParsedWrapperArgs | undefined => {
  const parsed: ParsedWrapperArgs = { agentArgs: [] };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    const eq = arg.startsWith('--') ? arg.indexOf('=') : -1;
    const flag = eq > 0 ? arg.slice(0, eq) : arg;
    const inline = eq > 0 ? arg.slice(eq + 1) : undefined;

    const takeValue = () => {
      if (inline !== undefined) return inline;
      index++;
      return args[index];
    };

    if (flag === '--agent-arg') {
      const value = takeValue();
      if (value === undefined) return undefined;
      parsed.agentArgs.push(value);
      continue;
    }

    const field = VALUE_FLAGS[flag];
    if (!field) return undefined;
    const value = takeValue();
    if (value === undefined) return undefined;
    (parsed as unknown as Record<string, string>)[field] = value;
  }
  return parsed;
};

/** Selector translation, identical to `buildExtraArgs` in `apps/cli/src/commands/hetero.ts`. */
const selectorArgsFor = (type: string, options: ParsedWrapperArgs): string[] => {
  switch (type) {
    case 'amp': {
      return options.mode ? ['--mode', options.mode] : [];
    }
    case 'codex': {
      return [
        ...(options.model ? ['--model', options.model] : []),
        ...(options.effort
          ? ['-c', `${CODEX_REASONING_EFFORT_CONFIG_KEY}="${options.effort}"`]
          : []),
        ...(options.speed ? ['-c', `${CODEX_SERVICE_TIER_CONFIG_KEY}="${options.speed}"`] : []),
      ];
    }
    case 'claude-code':
    case 'codebuddy':
    case 'grok-build': {
      return [
        ...(options.model ? ['--model', options.model] : []),
        ...(options.effort ? ['--effort', options.effort] : []),
      ];
    }
    case 'cursor':
    case 'devin':
    case 'kimi-code':
    case 'opencode':
    case 'pi': {
      return options.model ? ['--model', options.model] : [];
    }
    case 'qoder': {
      return [
        ...(options.model ? ['--model', options.model] : []),
        ...(options.effort ? ['--reasoning-effort', options.effort] : []),
      ];
    }
    default: {
      return [];
    }
  }
};

/**
 * Translate the dispatched `hetero exec` wrapper args into the options an
 * in-process persistent agent takes. Returns `undefined` for any flag this
 * translation does not know, so the caller keeps the CLI path (which owns the
 * authoritative parser) instead of silently dropping it.
 */
export const resolveInProcessAgentArgs = (
  agentType: string,
  args: string[] | undefined,
): InProcessAgentArgs | undefined => {
  const parsed = parseWrapperArgs(args ?? []);
  if (!parsed) return undefined;
  if (!!parsed.permissionId !== !!parsed.permissionValue) return undefined;

  return {
    command: parsed.command,
    extraArgs: [...parsed.agentArgs, ...selectorArgsFor(agentType, parsed)],
    initialPermission:
      parsed.permissionId && parsed.permissionValue
        ? { configId: parsed.permissionId, value: parsed.permissionValue }
        : undefined,
  };
};

import type { HeterogeneousAgentModel } from '@orvilo/types';

export interface StaticModelOption {
  label: string;
  value: string;
}

/**
 * Names and values Claude Code 2.1.300 reported on `session/new` model config.
 * An alias such as `haiku` is what `--model` accepts; its name carries the version.
 */
export const CLAUDE_CODE_STATIC_MODEL_OPTIONS: StaticModelOption[] = [
  { label: 'Opus 5.5', value: 'opus' },
  { label: 'Fable 5.1', value: 'fable' },
  { label: 'Sonnet 5.5', value: 'sonnet' },
  { label: 'Haiku 5.5', value: 'haiku' },
  { label: 'Haiku 4.5', value: 'claude-haiku-4-5-20251001' },
  { label: 'Sonnet 5', value: 'claude-sonnet-5' },
  { label: 'Opus 5', value: 'claude-opus-5' },
  { label: 'Fable 5', value: 'claude-fable-5' },
  { label: 'Opus 4.8', value: 'claude-opus-4-8' },
  { label: 'Opus 4.7', value: 'claude-opus-4-7' },
  { label: 'Opus 4.6', value: 'claude-opus-4-6' },
  { label: 'Sonnet 4.6', value: 'claude-sonnet-4-6' },
];

/** Fallback when `codex debug models --bundled` is missing, empty, or malformed. */
export const CODEX_STATIC_MODEL_OPTIONS: StaticModelOption[] = [
  { label: 'GPT-6 Astra', value: 'gpt-6-astra' },
  { label: 'GPT-5.6 Sol', value: 'gpt-5.6-sol' },
  { label: 'GPT-5.6 Terra', value: 'gpt-5.6-terra' },
  { label: 'GPT-5.6 Luna', value: 'gpt-5.6-luna' },
  { label: 'GPT-5.5', value: 'gpt-5.5' },
  { label: 'GPT-5.4', value: 'gpt-5.4' },
  { label: 'GPT-5.4 Mini', value: 'gpt-5.4-mini' },
  { label: 'GPT-5.3 Codex Spark', value: 'gpt-5.3-codex-spark' },
];

const STATIC_MODEL_OPTIONS: Record<string, StaticModelOption[]> = {
  'claude-code': CLAUDE_CODE_STATIC_MODEL_OPTIONS,
  'codex': CODEX_STATIC_MODEL_OPTIONS,
};

export const getStaticModelOptions = (type: string | undefined): StaticModelOption[] =>
  (type && STATIC_MODEL_OPTIONS[type]) || [];

export const staticModelCatalog = (type: 'claude-code' | 'codex'): HeterogeneousAgentModel[] =>
  getStaticModelOptions(type).map((option) => ({
    id: option.value,
    label: option.label,
    modelId: option.value,
    providerId: type === 'claude-code' ? 'anthropic' : 'openai',
  }));

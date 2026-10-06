export interface StaticModelOption {
  label: string;
  value: string;
}

const CLAUDE_CODE_MODEL_OPTIONS: StaticModelOption[] = [
  // Aliases resolve by CLI version and provider, so do not promise a fixed version.
  { label: 'Fable', value: 'fable' },
  { label: 'Opus', value: 'opus' },
  { label: 'Sonnet', value: 'sonnet' },
  { label: 'Haiku', value: 'haiku' },
];

const CODEX_MODEL_OPTIONS: StaticModelOption[] = [
  { label: 'GPT-6 Astra', value: 'gpt-6-astra' },
  { label: 'GPT-5.6 Sol', value: 'gpt-5.6-sol' },
  { label: 'GPT-5.6 Terra', value: 'gpt-5.6-terra' },
  { label: 'GPT-5.6 Luna', value: 'gpt-5.6-luna' },
  { label: 'GPT-5.5', value: 'gpt-5.5' },
  { label: 'GPT-5.4', value: 'gpt-5.4' },
  { label: 'GPT-5.4 Mini', value: 'gpt-5.4-mini' },
  { label: 'GPT-5.3 Codex Spark', value: 'gpt-5.3-codex-spark' },
];

/**
 * Display names for the aliases `static` providers accept. These track CLI
 * releases rather than the provider contract, so they stay out of
 * `@orvilo/types` alongside the capability table.
 */
const STATIC_MODEL_OPTIONS: Record<string, StaticModelOption[]> = {
  'claude-code': CLAUDE_CODE_MODEL_OPTIONS,
  'codex': CODEX_MODEL_OPTIONS,
};

export const getStaticModelOptions = (type: string | undefined): StaticModelOption[] =>
  (type && STATIC_MODEL_OPTIONS[type]) || [];

export const MODEL_LABELS: Record<string, string> = {
  'gpt-5.6': 'GPT-5.6',
  ...Object.fromEntries(
    Object.values(STATIC_MODEL_OPTIONS)
      .flat()
      .map((option) => [option.value, option.label]),
  ),
};

/**
 * User-facing model name. Catalog entries carry an optional display `label`;
 * otherwise the raw `modelId`/`id` (e.g. `opencode/nemotron-3.5-lightning`)
 * keeps only its last segment — provider prefixes, channel slashes and flag
 * syntax are engineering detail user surfaces never render.
 */
export const modelDisplayLabel = (model: {
  id: string;
  label?: string;
  modelId: string;
}): string => {
  // Catalog labels can still carry a channel prefix (`OpenCode Zen/Nemotron…`),
  // which is the same engineering detail a raw id has — take the last segment
  // of whichever display string we end up with.
  const raw = (model.label?.trim() || model.modelId || model.id).trim();
  const last = raw.split('/').findLast(Boolean);
  return last ?? raw;
};

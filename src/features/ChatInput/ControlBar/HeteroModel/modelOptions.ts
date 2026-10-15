import { getStaticModelOptions } from '@orvilo/heterogeneous-agents/models/staticCatalogs';

export type { StaticModelOption } from '@orvilo/heterogeneous-agents/models/staticCatalogs';
export { getStaticModelOptions };

export const MODEL_LABELS: Record<string, string> = {
  'gpt-5.6': 'GPT-5.6',
  ...Object.fromEntries(
    ['claude-code', 'codex'].flatMap((type) =>
      getStaticModelOptions(type).map((option) => [option.value, option.label]),
    ),
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

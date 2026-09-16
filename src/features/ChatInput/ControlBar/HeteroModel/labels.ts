import type { HeterogeneousAgentMode, HeterogeneousReasoningEffort } from '@orvilo/types';
import { HETEROGENEOUS_AGENT_DEFAULT_SELECTION } from '@orvilo/types';

const EFFORT_LABEL_KEYS = {
  [HETEROGENEOUS_AGENT_DEFAULT_SELECTION]: 'heteroAgent.modelSelector.default',
  high: 'heteroAgent.modelSelector.reasoning.high',
  low: 'heteroAgent.modelSelector.reasoning.low',
  max: 'heteroAgent.modelSelector.reasoning.max',
  medium: 'heteroAgent.modelSelector.reasoning.medium',
  ultra: 'heteroAgent.modelSelector.reasoning.ultra',
  xhigh: 'heteroAgent.modelSelector.reasoning.xhigh',
} as const satisfies Record<HeterogeneousReasoningEffort, string>;

/**
 * Codex renames the `low` effort to "Light" in its official app UI while the
 * CLI value stays `low`; Claude Code keeps the plain "Low" wording.
 */
const CODEX_EFFORT_LABEL_KEYS = {
  ...EFFORT_LABEL_KEYS,
  low: 'heteroAgent.modelSelector.reasoning.light',
} as const satisfies Record<HeterogeneousReasoningEffort, string>;

const MODE_LABEL_KEYS = {
  [HETEROGENEOUS_AGENT_DEFAULT_SELECTION]: 'heteroAgent.modelSelector.default',
  high: 'heteroAgent.modelSelector.mode.high',
  low: 'heteroAgent.modelSelector.mode.low',
  medium: 'heteroAgent.modelSelector.mode.medium',
  ultra: 'heteroAgent.modelSelector.mode.ultra',
} as const satisfies Record<HeterogeneousAgentMode, string>;

type EffortLabelKey =
  | (typeof CODEX_EFFORT_LABEL_KEYS)[HeterogeneousReasoningEffort]
  | (typeof EFFORT_LABEL_KEYS)[HeterogeneousReasoningEffort];

export const getEffortLabelKeys = (
  type: string | undefined,
): Record<HeterogeneousReasoningEffort, EffortLabelKey> =>
  type === 'codex' ? CODEX_EFFORT_LABEL_KEYS : EFFORT_LABEL_KEYS;

export const getModeLabelKey = (mode: HeterogeneousAgentMode) => MODE_LABEL_KEYS[mode];

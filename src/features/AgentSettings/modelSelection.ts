import type {
  HeterogeneousProviderConfig,
  HeterogeneousReasoningEffort,
  HeteroSelection,
  HeteroSelectorCapability,
} from '@orvilo/types';
import { applyHeteroSelection, HETEROGENEOUS_AGENT_DEFAULT_SELECTION } from '@orvilo/types';

type ModelCapability = Required<Pick<HeteroSelectorCapability, 'model'>> & HeteroSelectorCapability;

export const resolveModelSwitchSelection = ({
  capability,
  effort,
  isFastSpeed,
  value,
}: {
  capability: ModelCapability;
  effort?: HeterogeneousReasoningEffort;
  isFastSpeed: boolean;
  value: string;
}): HeteroSelection => {
  const resetSpeed = isFastSpeed && !!capability.speed && !capability.speed.supported(value);
  const resetEffort =
    !!effort &&
    effort !== HETEROGENEOUS_AGENT_DEFAULT_SELECTION &&
    !!capability.effort &&
    !capability.effort.levels(value).includes(effort);

  return {
    ...(resetEffort ? { effort: HETEROGENEOUS_AGENT_DEFAULT_SELECTION } : {}),
    model: value,
    ...(resetSpeed ? { speed: HETEROGENEOUS_AGENT_DEFAULT_SELECTION } : {}),
  };
};

/** A saved Default selection must remain explicit under the required-model contract. */
export const applySavedModelSelection = (
  config: HeterogeneousProviderConfig,
  selection: HeteroSelection,
): HeterogeneousProviderConfig => ({
  ...config,
  ...applyHeteroSelection(config, selection),
  model: selection.model ?? config.model ?? HETEROGENEOUS_AGENT_DEFAULT_SELECTION,
});

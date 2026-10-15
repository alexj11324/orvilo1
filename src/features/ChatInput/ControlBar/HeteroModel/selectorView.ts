import type {
  HeterogeneousReasoningEffort,
  HeteroSelection,
  HeteroSelectorCapability,
} from '@orvilo/types';
import { HETEROGENEOUS_AGENT_DEFAULT_SELECTION } from '@orvilo/types';

export type ModelCapability = Required<Pick<HeteroSelectorCapability, 'model'>> &
  HeteroSelectorCapability;

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

import type { BuiltinIntervention } from '@orvilo/types';

import { WebOnboardingApiName } from '../../../types';
import PickAgentsIntervention from './PickAgents';

export const AgentMarketplaceInterventions: Record<string, BuiltinIntervention> = {
  [WebOnboardingApiName.showAgentMarketplace]: PickAgentsIntervention as BuiltinIntervention,
};

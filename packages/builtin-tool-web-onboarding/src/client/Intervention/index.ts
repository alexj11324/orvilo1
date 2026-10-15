import type { BuiltinIntervention } from '@orvilo/types';

import { WebOnboardingApiName } from '../../types';
import SaveUserQuestionIntervention from './SaveUserQuestion';

export const WebOnboardingInterventions: Record<string, BuiltinIntervention> = {
  [WebOnboardingApiName.saveUserQuestion]: SaveUserQuestionIntervention as BuiltinIntervention,
};

export { default as SaveUserQuestionIntervention } from './SaveUserQuestion';

import type { BuiltinIntervention } from '@orvilo/types';

import { UserInteractionApiName } from '../../types';
import AskUserQuestionIntervention from './AskUserQuestion';

export const UserInteractionInterventions: Record<string, BuiltinIntervention> = {
  [UserInteractionApiName.askUserQuestion]: AskUserQuestionIntervention as BuiltinIntervention,
};

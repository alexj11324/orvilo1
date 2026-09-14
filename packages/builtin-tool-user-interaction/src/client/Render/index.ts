import type { BuiltinRender } from '@orvilo/types';

import { UserInteractionApiName } from '../../types';
import AskUserQuestionRender from './AskUserQuestion';

export const UserInteractionRenders: Record<string, BuiltinRender> = {
  [UserInteractionApiName.askUserQuestion]: AskUserQuestionRender as BuiltinRender,
};

export { default as AskUserQuestionRender } from './AskUserQuestion';

import { UserInteractionIdentifier } from '@orvilo/builtin-tool-user-interaction';
import { UserInteractionExecutionRuntime } from '@orvilo/builtin-tool-user-interaction/executionRuntime';

import { type ServerRuntimeRegistration } from './types';

export const userInteractionRuntime: ServerRuntimeRegistration = {
  factory: () => {
    return new UserInteractionExecutionRuntime();
  },
  identifier: UserInteractionIdentifier,
};

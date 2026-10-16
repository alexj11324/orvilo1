import type { BuiltinToolResult } from '@orvilo/types';
import { BaseExecutor } from '@orvilo/types';

import { GoalIdentifier } from '../../manifest';
import { GoalApiName } from '../../types';

/** Persisted old calls cannot restart the standalone Goal producer. */
class GoalExecutor extends BaseExecutor<typeof GoalApiName> {
  readonly identifier = GoalIdentifier;
  protected readonly apiEnum = GoalApiName;

  createGoal = async (): Promise<BuiltinToolResult> => ({
    content: 'Standalone Goal execution is unavailable; use an Issue plan and Checklist',
    error: { type: 'NotSupported', message: 'Standalone Goal execution is unavailable' },
    success: false,
  });
}

export const goalExecutor = new GoalExecutor();

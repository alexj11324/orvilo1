import { GoalIdentifier } from '@orvilo/builtin-tool-goal';

import { assertGoalExecutionAvailable } from '@/server/services/goal/retirement';

import type { ServerRuntimeRegistration } from './types';

/**
 * The Agent Goal tool no longer creates a standalone Goal. Issue plans own
 * new orchestration; historical Goal graphs stay readable through their queries.
 */
export const goalRuntime: ServerRuntimeRegistration = {
  factory: (context) => {
    if (!context.userId || !context.serverDB) {
      throw new Error('userId and serverDB are required for Goal tool execution');
    }

    return {
      createGoal: async (args: { name: string }) => {
        try {
          assertGoalExecutionAvailable();
        } catch (error) {
          return {
            content:
              error instanceof Error
                ? error.message
                : 'Standalone Goal execution is unavailable; use an Issue plan and Checklist',
            state: { name: args.name, success: false },
            success: false,
          };
        }
      },
    };
  },
  identifier: GoalIdentifier,
};

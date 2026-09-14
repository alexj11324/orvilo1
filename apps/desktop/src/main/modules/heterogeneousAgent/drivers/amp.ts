import { AMP_BASE_ARGS } from '@orvilo/heterogeneous-agents/spawn';

import type { HeterogeneousAgentBuildPlanParams, HeterogeneousAgentDriver } from '../types';

export const ampDriver: HeterogeneousAgentDriver = {
  async buildSpawnPlan({
    args,
    helpers,
    promptInput,
    resumeSessionId,
  }: HeterogeneousAgentBuildPlanParams) {
    const { args: inputArgs, stdin: stdinPayload } = await helpers.buildAgentInput(
      'amp',
      promptInput,
    );
    const executionArgs = [...AMP_BASE_ARGS, ...inputArgs, ...args];

    return {
      args: resumeSessionId
        ? ['threads', 'continue', resumeSessionId, ...executionArgs]
        : executionArgs,
      stdinPayload,
    };
  },
};

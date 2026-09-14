import type { AgentInstruction, InstructionExecutor } from '@orvilo/agent-runtime';
import { createAgentRuntimeExecutors } from '@orvilo/agent-runtime';

import { buildHost } from './buildHost';
import type { RuntimeExecutorContext } from './context';

export { type RuntimeExecutorContext } from './context';

export const createRuntimeExecutors = (
  ctx: RuntimeExecutorContext,
): Partial<Record<AgentInstruction['type'], InstructionExecutor>> => {
  return createAgentRuntimeExecutors(buildHost(ctx));
};

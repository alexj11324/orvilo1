import { UserInteractionExecutionRuntime } from '@orvilo/builtin-tool-user-interaction/executionRuntime';
import { UserInteractionExecutor } from '@orvilo/builtin-tool-user-interaction/executor';

const runtime = new UserInteractionExecutionRuntime();

export const userInteractionExecutor = new UserInteractionExecutor(runtime);

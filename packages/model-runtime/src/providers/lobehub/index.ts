import { lobehubRouterRuntimeOptions } from '@orvilo/business-model-runtime';

import { createRouterRuntime } from '../../core/RouterRuntime';
import type { CreateRouterRuntimeOptions } from '../../core/RouterRuntime/createRuntime';

export const LobeHubAI = createRouterRuntime(
  lobehubRouterRuntimeOptions as CreateRouterRuntimeOptions,
);

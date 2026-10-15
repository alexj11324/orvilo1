import { aiModelSelectors, useAiInfraStore } from '@/store/aiInfra';

import { useEffectiveModel } from '../../hooks/useEffectiveModel';

export const useParamsModelConfig = (agentId: string) => {
  const { model, provider } = useEffectiveModel(agentId);

  const hasModelConfig = useAiInfraStore(aiModelSelectors.isModelHasExtendParams(model, provider));
  const disabledParams = useAiInfraStore(aiModelSelectors.modelDisabledParams(model, provider));

  return { disabledParams, hasModelConfig, model, provider };
};

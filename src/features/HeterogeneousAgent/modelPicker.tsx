import type { ServerDefaultHeterogeneousAgentType } from '@orvilo/heterogeneous-agents';
import type { OrviloDefaultAiModelListItem } from 'model-bank';

import { ModelItemRender } from '@/components/ModelSelect';

interface ServerDefaultModel {
  model: string;
}

/** A server deployed before an agent was added can omit that agent's model entry. */
export const resolveServerDefaultAgentModels = (
  models: Partial<Record<ServerDefaultHeterogeneousAgentType, ServerDefaultModel[]>> | undefined,
  agentType: ServerDefaultHeterogeneousAgentType | undefined,
): ServerDefaultModel[] => (agentType ? (models?.[agentType] ?? []) : []);

export const resolveServerDefaultModelMeta = (
  model: string,
  builtinAiModelList: OrviloDefaultAiModelListItem[],
) =>
  builtinAiModelList.find((item) => item.id === model && item.providerId === 'orvilo') ??
  builtinAiModelList.find((item) => item.id === model);

/** Closed-trigger text. Prefer Select's public `title`, not extra option fields. */
export const compactModelTriggerText = (option: { title?: string; value?: unknown }) => {
  const value = String(option.value ?? '');
  const modelId = value.includes('/') ? value.slice(value.indexOf('/') + 1) : value;
  return option.title || modelId;
};

export const buildServerDefaultModelOptions = (
  models: ServerDefaultModel[],
  builtinAiModelList: OrviloDefaultAiModelListItem[],
) =>
  models.map(({ model }) => {
    const meta = resolveServerDefaultModelMeta(model, builtinAiModelList);
    const title = meta?.displayName ?? model;

    return {
      label: (
        <ModelItemRender
          displayName={meta?.displayName}
          id={model}
          releasedAt={meta?.releasedAt}
          showInfoTag={false}
        />
      ),
      title,
      value: model,
    };
  });

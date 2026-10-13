import type { ServerDefaultHeterogeneousAgentType } from '@orvilo/heterogeneous-agents';
import type { OrviloDefaultAiModelListItem } from 'model-bank';

import { ModelItemRender } from '@/components/ModelSelect';

import nativeStyles from './modelPicker.module.css';

export const MODEL_PICKER_STYLE = { minWidth: 200, width: 'initial' } as const;

/** Closed trigger next to the composer send button — hug the label, cap growth. */
export const COMPACT_MODEL_PICKER_STYLE = { maxWidth: 160, minWidth: 0, width: 'auto' } as const;

interface ServerDefaultModel {
  model: string;
}

/** A server deployed before an agent was added can omit that agent's model entry. */
export const resolveServerDefaultAgentModels = (
  models: Partial<Record<ServerDefaultHeterogeneousAgentType, ServerDefaultModel[]>> | undefined,
  agentType: ServerDefaultHeterogeneousAgentType | undefined,
): ServerDefaultModel[] => (agentType ? (models?.[agentType] ?? []) : []);

export const modelPickerStyles = {
  compactLabel: nativeStyles.compactLabel,
  picker: nativeStyles.picker,
};

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

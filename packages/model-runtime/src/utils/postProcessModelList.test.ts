import type { ChatModelCard } from '@orvilo/types';
import type { AiModelType } from 'model-bank';
import { describe, expect, it, vi } from 'vitest';

import { postProcessModelList } from './postProcessModelList';

describe('postProcessModelList', () => {
  const mockModels: ChatModelCard[] = [
    {
      id: 'gpt-3.5-turbo',
      displayName: 'GPT-3.5 Turbo',
      enabled: true,
    },
    {
      id: 'claude-3-opus',
      displayName: 'Claude 3 Opus',
      enabled: true,
      type: 'chat' as AiModelType,
    },
  ];

  it('should ensure all models have type field with default "chat"', async () => {
    const result = await postProcessModelList(mockModels);

    expect(result).toHaveLength(mockModels.length);
    result.forEach((model) => {
      expect(model.type).toBeDefined();
      if (!mockModels.find((m) => m.id === model.id)?.type) {
        expect(model.type).toBe('chat');
      }
    });
  });

  it('should preserve existing type field', async () => {
    const result = await postProcessModelList(mockModels);
    const claudeModel = result.find((m) => m.id === 'claude-3-opus');

    expect(claudeModel?.type).toBe('chat');
  });

  it('should use getModelTypeProperty when type is missing', async () => {
    const modelsWithoutType: ChatModelCard[] = [
      {
        id: 'custom-model',
        displayName: 'Custom Model',
        enabled: true,
      },
    ];

    const getModelTypeProperty = vi.fn().mockResolvedValue('embedding' as AiModelType);
    const result = await postProcessModelList(modelsWithoutType, getModelTypeProperty);

    expect(getModelTypeProperty).toHaveBeenCalledWith('custom-model');
    expect(result[0].type).toBe('embedding');
  });

  it('should handle empty model list', async () => {
    const result = await postProcessModelList([]);
    expect(result).toEqual([]);
  });
});

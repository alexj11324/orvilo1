import { describe, expect, it } from 'vitest';

import { resolveSystemAgentModelConfig } from './modelConfig';

describe('resolveSystemAgentModelConfig', () => {
  it('should keep a configured Orvilo chat model', async () => {
    const result = await resolveSystemAgentModelConfig({
      taskConfig: {
        model: 'deepseek-v4-pro',
        provider: 'orvilo',
      },
      taskKey: 'topic',
    });

    expect(result).toEqual({ model: 'deepseek-v4-pro', provider: 'orvilo' });
  });

  it('should let runtime hooks resolve Orvilo model mapping', async () => {
    const result = await resolveSystemAgentModelConfig({
      taskConfig: {
        model: 'mapped-topic-model',
        provider: 'orvilo',
      },
      taskKey: 'topic',
    });

    expect(result).toEqual({ model: 'mapped-topic-model', provider: 'orvilo' });
  });

  it('should keep deprecated Orvilo model ids for runtime-level rejection', async () => {
    const result = await resolveSystemAgentModelConfig({
      taskConfig: {
        model: 'ag/gemini-3.1-pro-high',
        provider: 'orvilo',
      },
      taskKey: 'topic',
    });

    expect(result).toEqual({ model: 'ag/gemini-3.1-pro-high', provider: 'orvilo' });
  });

  it('should keep non-Orvilo provider model ids untouched', async () => {
    const result = await resolveSystemAgentModelConfig({
      taskConfig: {
        model: 'private-model',
        provider: 'openai-compatible',
      },
      taskKey: 'topic',
    });

    expect(result).toEqual({ model: 'private-model', provider: 'openai-compatible' });
  });
});

// @vitest-environment node
import { ModelProvider } from 'model-bank';
import type { Mock } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { OrviloOpenAICompatibleRuntime } from '../../core/BaseAI';
import { testProvider } from '../../providerTestUtils';
import models from './fixtures/models.json';
import { OrviloPPIOAI } from './index';

const provider = ModelProvider.PPIO;
const defaultBaseURL = 'https://api.ppinfra.com/v3/openai';

testProvider({
  Runtime: OrviloPPIOAI,
  provider,
  defaultBaseURL,
  chatDebugEnv: 'DEBUG_PPIO_CHAT_COMPLETION',
  chatModel: 'deepseek-r1',
});

// Mock the console.error to avoid polluting test output
vi.spyOn(console, 'error').mockImplementation(() => {});

let instance: OrviloOpenAICompatibleRuntime;

beforeEach(() => {
  instance = new OrviloPPIOAI({ apiKey: 'test' });

  // Use vi.spyOn to mock the chat.completions.create method
  vi.spyOn(instance['client'].chat.completions, 'create').mockResolvedValue(
    new ReadableStream() as any,
  );
  vi.spyOn(instance['client'].models, 'list').mockResolvedValue({ data: [] } as any);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('PPIO', () => {
  describe('models', () => {
    it('should get models', async () => {
      // Mock the models.list method
      (instance['client'].models.list as Mock).mockResolvedValue({ data: models });

      const list = await instance.models();

      expect(list).toMatchSnapshot();
    });
  });
});

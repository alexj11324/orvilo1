import { describe, expect, it } from 'vitest';

import { parseSystemAgent } from './parseSystemAgent';

describe('parseSystemAgent', () => {
  it('should parse a valid environment variable string correctly', () => {
    const envValue = 'thread=openai/gpt-3.5-turbo,orchestrationWorkflow=anthropic/claude-1';
    const expected = {
      thread: { provider: 'openai', model: 'gpt-3.5-turbo' },
      orchestrationWorkflow: { provider: 'anthropic', model: 'claude-1' },
    };

    expect(parseSystemAgent(envValue)).toEqual(expected);
  });

  it('should handle empty environment variable string', () => {
    const envValue = '';
    const expected = {};

    expect(parseSystemAgent(envValue)).toEqual(expected);
  });

  it('should ignore unknown keys in environment variable string', () => {
    const envValue = 'thread=openai/gpt-3.5-turbo,unknown=test/model';
    const expected = {
      thread: { provider: 'openai', model: 'gpt-3.5-turbo' },
    };

    expect(parseSystemAgent(envValue)).toEqual(expected);
  });

  it('should throw an error for missing model or provider values', () => {
    const envValue1 = 'thread=openai,orchestrationWorkflow=/claude-1';
    const envValue2 = 'thread=/gpt-3.5-turbo,orchestrationWorkflow=anthropic/';

    expect(() => parseSystemAgent(envValue1)).toThrowError(/Missing model or provider/);
    expect(() => parseSystemAgent(envValue2)).toThrowError(/Missing model or provider/);
  });

  it('should throw an error for invalid environment variable format', () => {
    const envValue = 'thread-openai/gpt-3.5-turbo';

    expect(() => parseSystemAgent(envValue)).toThrowError(/Invalid environment variable format/);
  });

  it('should handle provider or model names with special characters', () => {
    const envValue = 'thread=openrouter/mistralai/mistral-7b-instruct:free';
    const expected = {
      thread: { provider: 'openrouter', model: 'mistralai/mistral-7b-instruct:free' },
    };

    expect(parseSystemAgent(envValue)).toEqual(expected);
  });

  it('should handle extra whitespace in environment variable string', () => {
    const envValue =
      '  thread = openai/gpt-3.5-turbo , orchestrationWorkflow = anthropic/claude-1 ';
    const expected = {
      thread: { provider: 'openai', model: 'gpt-3.5-turbo' },
      orchestrationWorkflow: { provider: 'anthropic', model: 'claude-1' },
    };

    expect(parseSystemAgent(envValue)).toEqual(expected);
  });

  it('should handle full-width comma in environment variable string', () => {
    const envValue = 'thread=openai/gpt-3.5-turbo，orchestrationWorkflow=anthropic/claude-1';
    const expected = {
      thread: { provider: 'openai', model: 'gpt-3.5-turbo' },
      orchestrationWorkflow: { provider: 'anthropic', model: 'claude-1' },
    };

    expect(parseSystemAgent(envValue)).toEqual(expected);
  });

  it('should handle extra whitespace around provider and model names', () => {
    const envValue = 'thread= openai / gpt-3.5-turbo ,orchestrationWorkflow= anthropic / claude-1 ';
    const expected = {
      thread: { provider: 'openai', model: 'gpt-3.5-turbo' },
      orchestrationWorkflow: { provider: 'anthropic', model: 'claude-1' },
    };

    expect(parseSystemAgent(envValue)).toEqual(expected);
  });

  it('should handle an excessively long environment variable string', () => {
    const longProviderName = 'a'.repeat(100);
    const longModelName = 'b'.repeat(100);
    const envValue = `thread=${longProviderName}/${longModelName}`;
    const expected = {
      thread: { provider: longProviderName, model: longModelName },
    };

    expect(parseSystemAgent(envValue)).toEqual(expected);
  });

  it('should apply default setting to all system agents when default is specified', () => {
    const envValue = 'default=ollama/deepseek-v3';

    const result = parseSystemAgent(envValue);

    expect(result.onboardingTaskRecommender).toEqual({ provider: 'ollama', model: 'deepseek-v3' });
    expect(result.orchestrationWorkflow).toEqual({ provider: 'ollama', model: 'deepseek-v3' });
    expect(result.onboardingUnderstanding).toEqual({ provider: 'ollama', model: 'deepseek-v3' });
    expect(result.expertise).toEqual({ provider: 'ollama', model: 'deepseek-v3' });
    expect(result.expertise).toEqual({ provider: 'ollama', model: 'deepseek-v3' });
    expect(result.onboardingUnderstanding).toEqual({
      provider: 'ollama',
      model: 'deepseek-v3',
    });
    expect(result.onboardingTaskRecommender).toEqual({
      provider: 'ollama',
      model: 'deepseek-v3',
    });
    expect(result.onboardingTaskRecommender).toEqual({ provider: 'ollama', model: 'deepseek-v3' });
    expect(result.userMemoryEmbedding).toBeUndefined();
    expect(result.memoryAnalysisAgentConfig).toBeUndefined();
    expect(result.userMemoryPersonaWriter).toBeUndefined();
  });

  it('should parse memory service model assignments explicitly', () => {
    const envValue =
      'memoryAnalysisAgentConfig=orvilo/gpt-5.4-mini,userMemoryEmbedding=openai/text-embedding-3-large';

    const result = parseSystemAgent(envValue);

    expect(result.memoryAnalysisAgentConfig).toEqual({
      provider: 'orvilo',
      model: 'gpt-5.4-mini',
    });
    expect(result.userMemoryEmbedding).toEqual({
      provider: 'openai',
      model: 'text-embedding-3-large',
    });
  });

  /** @example Onboarding generation tasks can select different providers and models. */
  it('should parse onboarding task model assignments independently', () => {
    const envValue =
      'onboardingUnderstanding=orvilo/gpt-5.4-mini,onboardingTaskRecommender=anthropic/claude-sonnet-4-5';

    const result = parseSystemAgent(envValue);

    expect(result.onboardingUnderstanding).toEqual({
      model: 'gpt-5.4-mini',
      provider: 'orvilo',
    });
    expect(result.onboardingTaskRecommender).toEqual({
      model: 'claude-sonnet-4-5',
      provider: 'anthropic',
    });
  });

  it('should override default setting with specific settings', () => {
    const envValue = 'default=ollama/deepseek-v3,thread=openai/gpt-4';

    const result = parseSystemAgent(envValue);

    expect(result.thread).toEqual({ provider: 'openai', model: 'gpt-4' });

    expect(result.orchestrationWorkflow).toEqual({ provider: 'ollama', model: 'deepseek-v3' });
    expect(result.onboardingUnderstanding).toEqual({ provider: 'ollama', model: 'deepseek-v3' });
    expect(result.expertise).toEqual({ provider: 'ollama', model: 'deepseek-v3' });
    expect(result.onboardingTaskRecommender).toEqual({ provider: 'ollama', model: 'deepseek-v3' });
  });

  it('should properly handle priority when thread appears before default in the string', () => {
    // 即使 thread 在 default 之前出现，thread 的设置仍然应该优先
    const envValue = 'thread=openai/gpt-4,default=ollama/deepseek-v3';

    const result = parseSystemAgent(envValue);

    // thread 应该保持自己的设置而不被 default 覆盖
    expect(result.thread).toEqual({ provider: 'openai', model: 'gpt-4' });

    // 其他系统智能体应该使用默认配置
    expect(result.orchestrationWorkflow).toEqual({ provider: 'ollama', model: 'deepseek-v3' });
    expect(result.onboardingUnderstanding).toEqual({ provider: 'ollama', model: 'deepseek-v3' });
    expect(result.expertise).toEqual({ provider: 'ollama', model: 'deepseek-v3' });
    expect(result.onboardingTaskRecommender).toEqual({ provider: 'ollama', model: 'deepseek-v3' });
  });
});

describe('retired system agent settings', () => {
  it('ignores obsolete assignments and keeps active model assignments', () => {
    expect(
      parseSystemAgent(
        'topicAutoSummary=openai/old,inputCompletion=openai/old,topic=openai/old,agentMeta=openai/old,orchestrationWorkflow=openai/current',
      ),
    ).toEqual({ orchestrationWorkflow: { provider: 'openai', model: 'current' } });
  });
});

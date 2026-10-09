import { describe, expect, it } from 'vitest';

import {
  isExternalAgentRuntime,
  resolveTopicTitleModel,
  resolveTopicTitleSource,
  sliceTopicTitle,
} from './topicTitle';

describe('isExternalAgentRuntime', () => {
  it('treats the built-in orvilo runtime and a missing provider as not external', () => {
    expect(isExternalAgentRuntime({ type: 'orvilo' })).toBe(false);
    expect(isExternalAgentRuntime(undefined)).toBe(false);
    expect(isExternalAgentRuntime(null)).toBe(false);
  });

  it('treats any CLI/ACP runtime as external', () => {
    expect(isExternalAgentRuntime({ type: 'claude-code' })).toBe(true);
    expect(isExternalAgentRuntime({ type: 'codex' })).toBe(true);
  });

  it('fails closed for a provider without a recognisable type', () => {
    expect(isExternalAgentRuntime({})).toBe(true);
    expect(isExternalAgentRuntime({ type: null })).toBe(true);
    expect(isExternalAgentRuntime({ type: '' })).toBe(true);
  });
});

describe('resolveTopicTitleModel', () => {
  it('uses the built-in agent model and provider', () => {
    expect(resolveTopicTitleModel({ model: 'gpt-5', provider: 'openai' })).toEqual({
      model: 'gpt-5',
      provider: 'openai',
    });
  });

  it('returns nothing for a heterogeneous agent even when it carries a model', () => {
    expect(
      resolveTopicTitleModel({ heterogeneous: true, model: 'sonnet', provider: 'claude-code' }),
    ).toBeUndefined();
  });

  it('returns nothing for a missing agent or a model-less agent', () => {
    expect(resolveTopicTitleModel(undefined)).toBeUndefined();
    expect(resolveTopicTitleModel({ model: '', provider: 'openai' })).toBeUndefined();
    expect(resolveTopicTitleModel({ model: 'gpt-5', provider: null })).toBeUndefined();
  });
});

describe('resolveTopicTitleSource', () => {
  it('prefers a title the agent reported, even for a built-in agent with a model', () => {
    expect(
      resolveTopicTitleSource({ model: 'gpt-5', provider: 'openai' }, '  Fix login  '),
    ).toEqual({ kind: 'agent', title: 'Fix login' });
    expect(resolveTopicTitleSource({ heterogeneous: true }, 'From CLI')).toEqual({
      kind: 'agent',
      title: 'From CLI',
    });
  });

  it('uses the model for a built-in agent and the slice otherwise', () => {
    expect(resolveTopicTitleSource({ model: 'gpt-5', provider: 'openai' }, '  ')).toEqual({
      kind: 'model',
      model: 'gpt-5',
      provider: 'openai',
    });
    expect(resolveTopicTitleSource({ heterogeneous: true, model: 'm', provider: 'p' })).toEqual({
      kind: 'slice',
    });
    expect(resolveTopicTitleSource(undefined)).toEqual({ kind: 'slice' });
  });
});

describe('sliceTopicTitle', () => {
  it('flattens the first user message and caps its length', () => {
    expect(sliceTopicTitle([{ content: '**Hello** world', role: 'user' }])).toBe('Hello world');
    expect(sliceTopicTitle([{ content: 'a'.repeat(200), role: 'user' }])).toHaveLength(80);
  });

  it('falls back when there is no user text', () => {
    expect(sliceTopicTitle([{ content: 'hi', role: 'assistant' }])).toBe('New Topic');
  });
});

import { describe, expect, it, vi } from 'vitest';

import { persistPermissionChoice } from './persistPermissionChoice';

const params = {
  agentId: 'agent-a',
  getCurrentComposerAgentId: () => 'agent-a',
  executionConfig: { executionTarget: 'local' as const, localSandbox: true },
  permission: { provider: 'codex', configId: 'mode', value: 'read-only' },
};
const makeStore = () => ({
  activeAgentId: 'agent-a' as string | null,
  activeTopicId: null as string | null,
  createTopic: vi.fn(async () => 'new-topic'),
  switchTopic: vi.fn(async (_topicId: string) => {}),
  updateTopicMetadata: vi.fn(async (_topicId: string, _metadata: unknown) => {}),
});

describe('conversation permission selection', () => {
  it('accepts composer B while the route remains on Agent A', async () => {
    const store = { ...makeStore(), activeAgentId: 'route-a' };
    await persistPermissionChoice(() => store, {
      ...params,
      agentId: 'composer-b',
      getCurrentComposerAgentId: () => 'composer-b',
    });
    expect(store.createTopic).toHaveBeenCalledWith('composer-b');
    expect(store.switchTopic).toHaveBeenCalledWith('new-topic');
  });
  it('does not switch after the composer agent changes during creation', async () => {
    const store = makeStore();
    let composer = 'agent-a';
    store.createTopic.mockImplementation(async () => {
      composer = 'agent-c';
      return 'new-topic';
    });
    await persistPermissionChoice(() => store, {
      ...params,
      getCurrentComposerAgentId: () => composer,
    });
    expect(store.switchTopic).not.toHaveBeenCalled();
  });
  it('creates a topic for a blank composer and stores permissions with its execution config', async () => {
    const store = makeStore();
    await persistPermissionChoice(() => store, params);
    expect(store.updateTopicMetadata).toHaveBeenCalledWith('new-topic', {
      executionConfig: { ...params.executionConfig, permission: params.permission },
    });
    expect(store.switchTopic).toHaveBeenCalledWith('new-topic');
  });
  it('does not create a conversation after the source blank composer has changed', async () => {
    const store = { ...makeStore(), activeAgentId: 'agent-b' };
    await persistPermissionChoice(() => store, {
      ...params,
      getCurrentComposerAgentId: () => 'agent-c',
    });
    expect(store.createTopic).not.toHaveBeenCalled();
  });
  it('does not switch away from a conversation opened while creation is pending', async () => {
    const store = makeStore();
    store.createTopic.mockImplementation(async () => {
      store.activeTopicId = 'other-topic';
      return 'new-topic';
    });
    await persistPermissionChoice(() => store, params);
    expect(store.updateTopicMetadata).toHaveBeenCalledWith('new-topic', expect.anything());
    expect(store.switchTopic).not.toHaveBeenCalled();
  });
  it('updates the captured existing topic without creating or switching topics', async () => {
    const store = makeStore();
    await persistPermissionChoice(() => store, { ...params, topicId: 'existing-topic' });
    expect(store.updateTopicMetadata).toHaveBeenCalledWith('existing-topic', expect.anything());
    expect(store.createTopic).not.toHaveBeenCalled();
    expect(store.switchTopic).not.toHaveBeenCalled();
  });
});

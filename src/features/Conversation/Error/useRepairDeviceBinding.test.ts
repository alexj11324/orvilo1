import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useRepairDeviceBinding } from './useRepairDeviceBinding';

const state = vi.hoisted(() => ({
  chat: {
    internal_dispatchTopic: vi.fn(),
  },
  lambdaClient: {
    topic: {
      repairDeviceBinding: { mutate: vi.fn() },
    },
  },
  topicService: {
    getTopicDetail: vi.fn(),
  },
}));

vi.mock('@/libs/trpc/client', () => ({
  lambdaClient: state.lambdaClient,
}));

vi.mock('@/store/chat', () => ({
  getChatStoreState: () => state.chat,
}));

vi.mock('@/services/topic', () => ({
  topicService: state.topicService,
}));

describe('useRepairDeviceBinding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.lambdaClient.topic.repairDeviceBinding.mutate.mockResolvedValue({
      bindingRevision: 2,
      boundDeviceId: 'new-device',
      outcome: 'repaired',
    });
    state.topicService.getTopicDetail.mockResolvedValue({
      id: 'topic-1',
      metadata: {
        bindingRevision: 2,
        boundDeviceId: 'new-device',
        executionConfig: { boundDeviceId: 'new-device', executionTarget: 'device' },
      },
      status: 'idle',
    });
  });

  it('forwards device + expected binding + revision to the server CAS endpoint', async () => {
    const { result } = renderHook(() => useRepairDeviceBinding('agent'));
    await expect(
      result.current({
        deviceId: 'new-device',
        expectedBindingRevision: 1,
        expectedBoundDeviceId: 'old-device',
        topicId: 'topic-1',
      }),
    ).resolves.toBe('repaired');

    expect(state.lambdaClient.topic.repairDeviceBinding.mutate).toHaveBeenCalledWith({
      deviceId: 'new-device',
      expectedBindingRevision: 1,
      expectedBoundDeviceId: 'old-device',
      id: 'topic-1',
    });
  });

  it('folds the fresh server row into the topic store on success', async () => {
    const { result } = renderHook(() => useRepairDeviceBinding('agent'));
    await result.current({ deviceId: 'new-device', topicId: 'topic-1' });

    expect(state.topicService.getTopicDetail).toHaveBeenCalledWith('topic-1');
    expect(state.chat.internal_dispatchTopic).toHaveBeenCalledWith(
      {
        id: 'topic-1',
        type: 'updateTopic',
        value: {
          metadata: expect.objectContaining({ boundDeviceId: 'new-device' }),
          status: 'idle',
        },
      },
      'repairDeviceBinding',
    );
  });

  it('returns binding-changed when the server CAS loses — never an overwrite', async () => {
    state.lambdaClient.topic.repairDeviceBinding.mutate.mockResolvedValue({
      bindingRevision: 3,
      boundDeviceId: 'winner-device',
      outcome: 'binding-changed',
    });
    const { result } = renderHook(() => useRepairDeviceBinding('agent'));
    await expect(
      result.current({
        deviceId: 'new-device',
        expectedBoundDeviceId: 'old-device',
        topicId: 'topic-1',
      }),
    ).resolves.toBe('binding-changed');
    // The store is NOT patched with a stale read on a lost race.
    expect(state.topicService.getTopicDetail).not.toHaveBeenCalled();
    expect(state.chat.internal_dispatchTopic).not.toHaveBeenCalled();
  });

  it('selection-required repair works with no expected binding at all', async () => {
    const { result } = renderHook(() => useRepairDeviceBinding('agent'));
    await expect(result.current({ deviceId: 'new-device', topicId: 'topic-1' })).resolves.toBe(
      'repaired',
    );
    expect(state.lambdaClient.topic.repairDeviceBinding.mutate).toHaveBeenCalledWith({
      deviceId: 'new-device',
      expectedBindingRevision: undefined,
      expectedBoundDeviceId: undefined,
      id: 'topic-1',
    });
  });

  it('propagates server rejections (authz / validation) — never swallowed as binding-changed', async () => {
    state.lambdaClient.topic.repairDeviceBinding.mutate.mockRejectedValue(
      new Error('The requested device is not in your authorized device registry.'),
    );
    const { result } = renderHook(() => useRepairDeviceBinding('agent'));
    await expect(result.current({ deviceId: 'new-device', topicId: 'topic-1' })).rejects.toThrow(
      'authorized device registry',
    );
    expect(state.chat.internal_dispatchTopic).not.toHaveBeenCalled();
  });

  it('still reports repaired when the post-repair display fetch misses', async () => {
    state.topicService.getTopicDetail.mockResolvedValue(null);
    const { result } = renderHook(() => useRepairDeviceBinding('agent'));
    await expect(result.current({ deviceId: 'new-device', topicId: 'topic-1' })).resolves.toBe(
      'repaired',
    );
    expect(state.chat.internal_dispatchTopic).not.toHaveBeenCalled();
  });
});

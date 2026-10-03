import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useRepairDeviceBinding } from './useRepairDeviceBinding';

const state = vi.hoisted(() => ({
  agencyConfig: {
    boundDeviceId: 'old-device',
    executionTarget: 'sandbox' as const,
    localSandbox: false,
    localSandboxNetwork: true,
  },
  chat: {
    updateTopicMetadata: vi.fn(),
  },
  topicService: {
    getTopicDetail: vi.fn(),
  },
}));

vi.mock('@/hooks/useTopicAgencyConfig', () => ({
  useTopicAgencyConfig: () => ({ agencyConfig: state.agencyConfig }),
}));

vi.mock('@/store/chat', () => ({
  useChatStore: Object.assign(
    (selector: (s: typeof state.chat) => unknown) => selector(state.chat),
    { getState: () => state.chat },
  ),
}));

vi.mock('@/services/topic', () => ({
  topicService: state.topicService,
}));

const topicWithBinding = (boundDeviceId?: string) => ({
  id: 'topic-1',
  metadata: {
    boundDeviceId,
    executionConfig: boundDeviceId ? { boundDeviceId, executionTarget: 'device' } : {},
    heteroSessionBindingKey: 'key-old',
    heteroSessionBindingKeyByWorkingDirectory: { '/w': 'key-old' },
    heteroSessionId: 'session-old',
    heteroSessionIdByWorkingDirectory: { '/w': 'session-old' },
  },
});

describe('useRepairDeviceBinding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.chat.updateTopicMetadata.mockResolvedValue(undefined);
    state.topicService.getTopicDetail.mockResolvedValue(topicWithBinding('old-device'));
  });

  it('writes the canonical binding triple when the stored binding still matches', async () => {
    const { result } = renderHook(() => useRepairDeviceBinding('agent'));
    await expect(
      result.current({
        deviceId: 'new-device',
        expectedBoundDeviceId: 'old-device',
        topicId: 'topic-1',
      }),
    ).resolves.toBe('repaired');

    expect(state.chat.updateTopicMetadata).toHaveBeenCalledWith('topic-1', {
      boundDeviceId: 'new-device',
      executionConfig: {
        boundDeviceId: 'new-device',
        executionTarget: 'device',
        inheritWorkspaceScope: false,
        localSandbox: false,
        localSandboxNetwork: true,
      },
      heteroSessionBindingKey: '',
      heteroSessionBindingKeyByWorkingDirectory: {},
      heteroSessionId: '',
      heteroSessionIdByWorkingDirectory: {},
    });
  });

  it('refuses to clobber a binding that changed underneath (CAS mismatch)', async () => {
    state.topicService.getTopicDetail.mockResolvedValue(topicWithBinding('other-device'));
    const { result } = renderHook(() => useRepairDeviceBinding('agent'));
    await expect(
      result.current({
        deviceId: 'new-device',
        expectedBoundDeviceId: 'old-device',
        topicId: 'topic-1',
      }),
    ).resolves.toBe('binding-changed');
    expect(state.chat.updateTopicMetadata).not.toHaveBeenCalled();
  });

  it('refuses when the topic vanished', async () => {
    state.topicService.getTopicDetail.mockResolvedValue(null);
    const { result } = renderHook(() => useRepairDeviceBinding('agent'));
    await expect(
      result.current({
        deviceId: 'new-device',
        expectedBoundDeviceId: 'old-device',
        topicId: 'topic-1',
      }),
    ).resolves.toBe('binding-changed');
    expect(state.chat.updateTopicMetadata).not.toHaveBeenCalled();
  });

  it('repairs a selection-required state only while still unbound', async () => {
    state.topicService.getTopicDetail.mockResolvedValue(topicWithBinding(undefined));
    const { result } = renderHook(() => useRepairDeviceBinding('agent'));
    await expect(result.current({ deviceId: 'new-device', topicId: 'topic-1' })).resolves.toBe(
      'repaired',
    );
    expect(state.chat.updateTopicMetadata).toHaveBeenCalledWith(
      'topic-1',
      expect.objectContaining({ boundDeviceId: 'new-device' }),
    );
  });

  it('refuses to write over a binding that arrived after the unbound error', async () => {
    state.topicService.getTopicDetail.mockResolvedValue(topicWithBinding('surprise-device'));
    const { result } = renderHook(() => useRepairDeviceBinding('agent'));
    await expect(result.current({ deviceId: 'new-device', topicId: 'topic-1' })).resolves.toBe(
      'binding-changed',
    );
    expect(state.chat.updateTopicMetadata).not.toHaveBeenCalled();
  });

  it('reads the legacy top-level binding when executionConfig lacks one', async () => {
    state.topicService.getTopicDetail.mockResolvedValue({
      id: 'topic-1',
      metadata: { boundDeviceId: 'old-device' },
    });
    const { result } = renderHook(() => useRepairDeviceBinding('agent'));
    await expect(
      result.current({
        deviceId: 'new-device',
        expectedBoundDeviceId: 'old-device',
        topicId: 'topic-1',
      }),
    ).resolves.toBe('repaired');
  });

  it('clears every heteroSession* handle — never reuses another device session', async () => {
    const { result } = renderHook(() => useRepairDeviceBinding('agent'));
    await result.current({
      deviceId: 'new-device',
      expectedBoundDeviceId: 'old-device',
      topicId: 'topic-1',
    });
    const metadata = state.chat.updateTopicMetadata.mock.calls[0][1];
    expect(metadata.heteroSessionId).toBe('');
    expect(metadata.heteroSessionBindingKey).toBe('');
    expect(metadata.heteroSessionIdByWorkingDirectory).toEqual({});
    expect(metadata.heteroSessionBindingKeyByWorkingDirectory).toEqual({});
  });
});

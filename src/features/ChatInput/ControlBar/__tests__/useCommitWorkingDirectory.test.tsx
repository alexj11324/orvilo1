import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCommitWorkingDirectory } from '../useCommitWorkingDirectory';

const testState = vi.hoisted(() => ({
  agent: {
    agencyConfig: undefined as Record<string, unknown> | undefined,
    agentMap: {} as Record<string, { visibility?: string; workspaceId?: string | null }>,
    localAgentWorkingDirectoryMap: {} as Record<string, string>,
    updateAgentConfigById: vi.fn(),
    updateAgentRuntimeEnvConfigById: vi.fn(),
  },
  chat: {
    activeTopicId: undefined as string | undefined,
    updateTopicMetadata: vi.fn(),
    operations: {} as Record<string, any>,
    topic: undefined as any,
  },
  confirmModal: vi.fn(),
  currentDeviceId: 'this-machine' as string | undefined,
  effective: {
    agencyConfig: undefined as Record<string, unknown> | undefined,
    workspaceScoped: false,
  },
}));

vi.mock('@/hooks/useTopicAgencyConfig', () => ({
  useTopicAgencyConfig: () => testState.effective,
}));

vi.mock('@/store/agent', () => ({
  useAgentStore: (selector: (s: typeof testState.agent) => unknown) => selector(testState.agent),
}));

vi.mock('@/store/agent/selectors', () => ({
  agentByIdSelectors: { getAgencyConfigById: () => (s: typeof testState.agent) => s.agencyConfig },
}));

vi.mock('@/store/chat', () => ({
  useChatStore: Object.assign(
    (selector: (s: typeof testState.chat) => unknown) => selector(testState.chat),
    { getState: () => testState.chat },
  ),
}));

vi.mock('@/store/chat/selectors', () => ({
  topicSelectors: { getTopicById: () => () => testState.chat.topic },
}));

vi.mock('@/store/device', () => ({
  useDeviceStore: (selector: (s: { updateDeviceCwd: unknown }) => unknown) =>
    selector({ updateDeviceCwd: vi.fn() }),
}));

vi.mock('@/store/electron', () => ({
  useElectronStore: (selector: (s: { gatewayDeviceInfo?: { deviceId?: string } }) => unknown) =>
    selector({ gatewayDeviceInfo: { deviceId: testState.currentDeviceId } }),
}));

vi.mock('@/components/Modal', () => ({ confirmModal: testState.confirmModal }));

describe('useCommitWorkingDirectory — localTarget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.agent.agencyConfig = undefined;
    testState.agent.agentMap = {};
    testState.agent.localAgentWorkingDirectoryMap = {};
    testState.agent.updateAgentConfigById = vi.fn();
    testState.agent.updateAgentRuntimeEnvConfigById = vi.fn();
    testState.chat.activeTopicId = undefined;
    testState.chat.topic = undefined;
    testState.chat.operations = {};
    testState.currentDeviceId = 'this-machine';
    testState.effective = { agencyConfig: undefined, workspaceScoped: false };
  });

  it('files a workspace member’s first sandbox pick against their own machine', async () => {
    // The caller selects `local` as part of the same action, so the config here
    // still describes the previous (workspace-shared) target — and selecting
    // first would not re-render in time. Without `localTarget` the path lands
    // in the shared row or nowhere, and the next command refuses again for
    // want of a working directory.
    testState.agent.agentMap = { 'agent-id': { visibility: 'public', workspaceId: 'ws-1' } };
    testState.effective = {
      agencyConfig: { boundDeviceId: 'shared-device', executionTarget: 'device' },
      workspaceScoped: true,
    };

    const { result } = renderHook(() => useCommitWorkingDirectory('agent-id'));
    await result.current.commit(
      { path: 'C:/Users/me/Orvilo/sandbox/agent-id' },
      {
        localTarget: true,
      },
    );

    // Per-user slot — never the workspace-shared row.
    expect(testState.agent.updateAgentRuntimeEnvConfigById).toHaveBeenCalledWith('agent-id', {
      workingDirectory: 'C:/Users/me/Orvilo/sandbox/agent-id',
    });
    expect(testState.agent.updateAgentConfigById).not.toHaveBeenCalled();
  });

  it('keeps a personal agent’s write on this device', async () => {
    const { result } = renderHook(() => useCommitWorkingDirectory('agent-id'));
    await result.current.commit({ path: 'C:/work' }, { localTarget: true });

    expect(testState.agent.updateAgentConfigById).toHaveBeenCalledWith('agent-id', {
      agencyConfig: { workingDirByDevice: { 'this-machine': { path: 'C:/work' } } },
    });
  });

  it('leaves ordinary writes routed by the resolved config', async () => {
    // No override: a `device` target still files against its bound device, so
    // the new option cannot change how the directory picker behaves.
    testState.effective = {
      agencyConfig: { boundDeviceId: 'other-device', executionTarget: 'device' },
      workspaceScoped: false,
    };
    testState.agent.agencyConfig = { boundDeviceId: 'other-device', executionTarget: 'device' };

    const { result } = renderHook(() => useCommitWorkingDirectory('agent-id'));
    await result.current.commit({ path: 'C:/work' });

    expect(testState.agent.updateAgentConfigById).toHaveBeenCalledWith('agent-id', {
      agencyConfig: {
        boundDeviceId: 'other-device',
        executionTarget: 'device',
        workingDirByDevice: { 'other-device': { path: 'C:/work' } },
      },
    });
  });
});

describe('working-directory session safety', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.chat.activeTopicId = 'topic-a';
    testState.chat.operations = {};
    testState.chat.topic = {
      metadata: { workingDirectory: '/repo', heteroSessionId: 'session-source' },
    };
    testState.agent.agencyConfig = { heterogeneousProvider: { type: 'codex' } };
  });

  it.each([false, true])(
    'blocks commit and clear while running (aborting=%s)',
    async (isAborting) => {
      testState.chat.operations = {
        run: {
          status: 'running',
          context: { agentId: 'agent-id', topicId: 'topic-a' },
          metadata: { isAborting },
        },
      };
      const { result } = renderHook(() => useCommitWorkingDirectory('agent-id'));
      await result.current.commit({ path: '/other' });
      await result.current.clear();
      expect(testState.confirmModal).not.toHaveBeenCalled();
      expect(testState.chat.updateTopicMetadata).not.toHaveBeenCalled();
    },
  );

  it('blocks a persisted remote run before its local operation attaches', async () => {
    testState.chat.topic.metadata.runningOperation = { operationId: 'remote-run' };
    const { result } = renderHook(() => useCommitWorkingDirectory('agent-id'));
    await result.current.commit({ path: '/other' });
    expect(testState.chat.updateTopicMetadata).not.toHaveBeenCalled();
    expect(testState.confirmModal).not.toHaveBeenCalled();
  });

  it('confirms an effective worktree change and never carries the source session', async () => {
    const { result } = renderHook(() => useCommitWorkingDirectory('agent-id'));
    await result.current.commit({ path: '/repo', git: { activeWorktree: '/repo-feature' } });
    expect(testState.confirmModal).toHaveBeenCalledTimes(1);
    expect(testState.chat.updateTopicMetadata).not.toHaveBeenCalled();
    await testState.confirmModal.mock.calls[0][0].onOk();
    expect(testState.chat.updateTopicMetadata).toHaveBeenCalledWith(
      'topic-a',
      expect.objectContaining({ workingDirectory: '/repo-feature', heteroSessionId: undefined }),
    );
  });

  it('rechecks run ownership when reset confirmation is accepted', async () => {
    const { result } = renderHook(() => useCommitWorkingDirectory('agent-id'));
    await result.current.commit({ path: '/other' });
    testState.chat.operations = {
      run: { status: 'running', context: { agentId: 'agent-id', topicId: 'topic-a' } },
    };
    await testState.confirmModal.mock.calls[0][0].onOk();
    expect(testState.chat.updateTopicMetadata).not.toHaveBeenCalled();
  });

  it('restores only the destination directory’s scoped session after confirmation', async () => {
    testState.chat.topic.metadata.heteroSessionIdByWorkingDirectory = {
      '/repo-feature': 'session-feature',
    };
    const { result } = renderHook(() => useCommitWorkingDirectory('agent-id'));
    await result.current.commit({ path: '/repo', git: { activeWorktree: '/repo-feature' } });
    await testState.confirmModal.mock.calls[0][0].onOk();
    expect(testState.chat.updateTopicMetadata).toHaveBeenCalledWith(
      'topic-a',
      expect.objectContaining({
        workingDirectory: '/repo-feature',
        heteroSessionId: 'session-feature',
      }),
    );
  });
});

it('allows first-run selection and uses the explicitly supplied conversation', async () => {
  vi.clearAllMocks();
  testState.chat.activeTopicId = 'another-topic';
  testState.chat.topic = undefined;
  testState.chat.operations = {};
  const { result } = renderHook(() => useCommitWorkingDirectory('agent-id', 'mounted-topic'));
  await result.current.commit({ path: '/repo', git: { activeWorktree: '/repo-new' } });
  expect(testState.confirmModal).not.toHaveBeenCalled();
  expect(testState.chat.updateTopicMetadata).toHaveBeenCalledWith(
    'mounted-topic',
    expect.objectContaining({ workingDirectory: '/repo-new' }),
  );
});

it('rechecks run ownership when clear confirmation is accepted', async () => {
  vi.clearAllMocks();
  testState.chat.activeTopicId = 'topic-a';
  testState.chat.operations = {};
  testState.chat.topic = {
    metadata: { workingDirectory: '/repo', heteroSessionId: 'old-session' },
  };
  const { result } = renderHook(() => useCommitWorkingDirectory('agent-id'));
  await result.current.clear();
  testState.chat.topic.metadata.runningOperation = { operationId: 'remote-run' };
  await testState.confirmModal.mock.calls[0][0].onOk();
  expect(testState.chat.updateTopicMetadata).not.toHaveBeenCalled();
});

it('keeps directories locked while cancelled native termination is still pending', async () => {
  vi.clearAllMocks();
  testState.chat.activeTopicId = 'topic-a';
  testState.chat.topic = { metadata: { workingDirectory: '/repo' } };
  testState.chat.operations = {
    run: {
      status: 'cancelled',
      context: { agentId: 'agent-id', topicId: 'topic-a' },
      metadata: { isAborting: true },
    },
  };
  const { result } = renderHook(() => useCommitWorkingDirectory('agent-id'));
  await result.current.commit({ path: '/other' });
  await result.current.clear();
  expect(testState.chat.updateTopicMetadata).not.toHaveBeenCalled();
  testState.chat.operations.run.metadata.isAborting = false;
  await result.current.commit({ path: '/other' });
  expect(testState.chat.updateTopicMetadata).toHaveBeenCalledWith(
    'topic-a',
    expect.objectContaining({ workingDirectory: '/other' }),
  );
});

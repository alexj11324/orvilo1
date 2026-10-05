import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useChatStore } from '@/store/chat';
import { useGlobalStore } from '@/store/global';
import { initialState } from '@/store/global/initialState';
import { systemStatusSelectors } from '@/store/global/selectors';

import { recordSendAgentUsage } from './recordSendAgentUsage';

const updateSystemStatusSpy = () => vi.spyOn(useGlobalStore.getState(), 'updateSystemStatus');

/**
 * `lastUsedAgentId` is written by exactly three user actions — explicit
 * composer pick, a send that ran under an agent, and a mid-topic handoff.
 * This pins the send-side writer: only an agent-context send may move the
 * default, and the composer pick that drove it is consumed so a stale pick
 * can't leak into the next new topic.
 */
describe('recordSendAgentUsage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // `updateSystemStatus` no-ops until status init — and this suite shares
    // the module graph, so reseed the fields it reads/writes each test.
    useGlobalStore.setState({
      isStatusInit: true,
      status: { ...initialState.status, lastUsedAgentId: undefined },
    });
    useChatStore.setState({ composerAgentId: undefined });
  });

  it('records the send’s agent as the next new topic’s default', () => {
    const spy = updateSystemStatusSpy();

    recordSendAgentUsage({ agentId: 'agent-send' });

    expect(spy).toHaveBeenCalledWith({ lastUsedAgentId: 'agent-send' });
    // The real store actually moved — spies call through by default.
    expect(systemStatusSelectors.lastUsedAgentId(useGlobalStore.getState())).toBe('agent-send');
  });

  it('consumes the composer pick that drove the send', () => {
    useChatStore.setState({ composerAgentId: 'agent-picked' });
    updateSystemStatusSpy();

    recordSendAgentUsage({ agentId: 'agent-send' });

    expect(useChatStore.getState().composerAgentId).toBeUndefined();
  });

  it('leaves an absent composer pick alone', () => {
    useChatStore.setState({ composerAgentId: undefined });
    const setStateSpy = vi.spyOn(useChatStore, 'setState');

    recordSendAgentUsage({ agentId: 'agent-send' });

    // Only the lastUsedAgentId write may touch the chat store here.
    expect(setStateSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ composerAgentId: expect.anything() }),
      expect.anything(),
      expect.anything(),
    );
  });

  it('never writes the personal default for a group send', () => {
    const spy = updateSystemStatusSpy();

    recordSendAgentUsage({ agentId: 'agent-supervisor', groupId: 'grp_1' });

    // A group context's "agent" is the supervisor — pinning it as the
    // personal default would leak group execution into the new-topic chain.
    expect(spy).not.toHaveBeenCalled();
  });

  it('does nothing for an agent-less context', () => {
    const spy = updateSystemStatusSpy();

    recordSendAgentUsage({ agentId: undefined });

    expect(spy).not.toHaveBeenCalled();
  });
});

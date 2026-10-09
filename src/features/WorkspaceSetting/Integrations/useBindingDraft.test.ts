import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useBindingDraft } from './useBindingDraft';

afterEach(() => {
  cleanup();
  localStorage.clear();
});
describe('Slack binding drafts', () => {
  it('reopens a saved A-to-B edit with B rather than the previous Agent', () => {
    const old = { agentId: 'agent-a', slackChannelId: 'channel-1' };
    const saved = { agentId: 'agent-b', slackChannelId: 'channel-1' };
    const first = renderHook(() => useBindingDraft('binding-1', old));
    act(() => first.result.current.setDraft(saved));
    act(() => first.result.current.markSaved(saved));
    first.unmount();
    const next = renderHook(() => useBindingDraft('binding-1', saved));
    expect(next.result.current.draft).toEqual(saved);
  });
  it('keeps a failed-save selection and isolates another workspace draft', () => {
    const initial = { agentId: '', slackChannelId: '' };
    const draft = { agentId: 'agent-a', slackChannelId: 'channel-1' };
    const first = renderHook(() => useBindingDraft('workspace-1:new', initial));
    act(() => first.result.current.setDraft(draft));
    first.unmount();
    expect(
      renderHook(() => useBindingDraft('workspace-1:new', initial)).result.current.draft,
    ).toEqual(draft);
    expect(
      renderHook(() => useBindingDraft('workspace-2:new', initial)).result.current.draft,
    ).toEqual(initial);
  });
});

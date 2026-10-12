/**
 * @vitest-environment happy-dom
 */
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { initialState as initialChatState } from '@/store/chat/initialState';
import { useChatStore } from '@/store/chat/store';
import { createInitialEditorContentState, useDocumentStore } from '@/store/document';
import { initialEditorState } from '@/store/document/slices/editor';
import { useGlobalStore } from '@/store/global';

import { useAgentContext } from './useAgentContext';

const activeWorkspaceSlugMock = vi.hoisted(() => ({ value: null as string | null }));

// The hand-over to the default Agent has its own tests; here every Agent is offered.
vi.mock('@/features/DefaultAgent/useDefaultAgent', () => ({
  useDefaultAgent: () => ({ agentId: 'agt_orchestrator', source: 'orchestrator' }),
  useOfferedAgentId: (agentId?: string | null) => agentId ?? undefined,
}));
vi.mock('@/business/client/hooks/useActiveWorkspaceSlug', () => ({
  useActiveWorkspaceSlug: () => activeWorkspaceSlugMock.value,
}));

describe('useAgentContext', () => {
  beforeEach(() => {
    activeWorkspaceSlugMock.value = null;
    useChatStore.setState(
      {
        ...initialChatState,
        activeAgentId: 'agt_1',
        activeThreadId: undefined,
        activeTopicId: 'tpc_1',
      },
      false,
    );
    useDocumentStore.setState({ ...initialEditorState }, false);
  });

  it('defaults blank Chat to the Orchestrator instead of the last used Agent', () => {
    useChatStore.setState({
      activeAgentId: undefined,
      activeTopicId: undefined,
      composerAgentId: undefined,
    });
    useGlobalStore.setState({
      status: { ...useGlobalStore.getState().status, lastUsedAgentId: 'agt_last' },
    });
    const { result } = renderHook(() => useAgentContext());
    expect(result.current.agentId).toBe('agt_orchestrator');
  });

  it('keeps an explicit composer pick for blank Chat', () => {
    useChatStore.setState({
      activeAgentId: undefined,
      activeTopicId: undefined,
      composerAgentId: 'agt_picked',
    });
    const { result } = renderHook(() => useAgentContext());
    expect(result.current.agentId).toBe('agt_picked');
  });

  it('keeps a specific Agent deep link for a blank conversation', () => {
    useChatStore.setState({
      activeAgentId: 'agt_deep_link',
      activeTopicId: undefined,
      composerAgentId: undefined,
    });
    const { result } = renderHook(() => useAgentContext());
    expect(result.current.agentId).toBe('agt_deep_link');
  });

  it('carries the active notebook document for the current topic in main scope', () => {
    useDocumentStore.setState(
      {
        activeDocumentId: 'docs_1',
        documents: {
          docs_1: createInitialEditorContentState('notebook', { topicId: 'tpc_1' }),
        },
      },
      false,
    );

    const { result } = renderHook(() => useAgentContext());

    expect(result.current).toEqual({
      agentId: 'agt_1',
      documentId: 'docs_1',
      scope: 'main',
      threadId: null,
      topicId: 'tpc_1',
    });
  });

  it('falls back to the last opened topic document after leaving the page route', () => {
    useDocumentStore.setState(
      {
        activeDocumentId: undefined,
        documents: {
          docs_1: createInitialEditorContentState('notebook', { topicId: 'tpc_1' }),
        },
        lastActiveTopicDocumentIdByTopicId: {
          tpc_1: 'docs_1',
        },
      },
      false,
    );

    const { result } = renderHook(() => useAgentContext());

    expect(result.current.documentId).toBe('docs_1');
  });

  it('can carry the last topic document id even when editor document state has been cleared', () => {
    useDocumentStore.setState(
      {
        activeDocumentId: undefined,
        documents: {},
        lastActiveTopicDocumentIdByTopicId: {
          tpc_1: 'docs_1',
        },
      },
      false,
    );

    const { result } = renderHook(() => useAgentContext());

    expect(result.current.documentId).toBe('docs_1');
  });

  it('does not carry a stale notebook document from another topic', () => {
    useDocumentStore.setState(
      {
        activeDocumentId: 'docs_1',
        documents: {
          docs_1: createInitialEditorContentState('notebook', { topicId: 'tpc_other' }),
        },
      },
      false,
    );

    const { result } = renderHook(() => useAgentContext());

    expect(result.current.documentId).toBeUndefined();
  });

  it('captures the active workspace slug for out-of-band navigation', () => {
    activeWorkspaceSlugMock.value = 'team';

    const { result } = renderHook(() => useAgentContext());

    expect(result.current.workspaceSlug).toBe('team');
  });
});

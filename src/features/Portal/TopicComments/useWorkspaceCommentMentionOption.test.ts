import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useWorkspaceCommentMentionOption } from './useWorkspaceCommentMentionOption';

vi.mock('@/business/client/hooks/useFetchWorkspaceMembers', () => ({
  useFetchWorkspaceMembers: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/business/client/hooks/useWorkspaceMembers', () => ({
  useWorkspaceMembers: () => [{ userId: 'member', user: { fullName: 'Member' } }],
}));
vi.mock('@/components/Avatar', () => ({ default: () => null }));

describe('comment mention candidates', () => {
  it('keeps ordinary comments member-only and adds only the supplied authorized Issue Agent', () => {
    const plain = renderHook(() => useWorkspaceCommentMentionOption());
    expect(plain.result.current?.items).toMatchObject([
      { key: 'member-member', metadata: { id: 'member', type: 'member' } },
    ]);
    const issue = renderHook(() =>
      useWorkspaceCommentMentionOption([{ id: 'current-usable-agent', name: 'Current Agent' }]),
    );
    expect(issue.result.current?.items).toMatchObject([
      { key: 'member-member', metadata: { type: 'member' } },
      {
        key: 'agent-current-usable-agent',
        metadata: { id: 'current-usable-agent', type: 'agent' },
      },
    ]);
  });
});

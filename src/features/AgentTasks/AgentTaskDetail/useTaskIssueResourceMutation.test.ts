/** @vitest-environment happy-dom */
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useTaskIssueResourceMutation } from './useTaskIssueResourceMutation';

const mocks = vi.hoisted(() => ({
  addLink: vi.fn(),
  canEdit: true,
  hasActiveWorkspace: true,
  close: vi.fn(),
  createDocument: vi.fn(),
  openDocument: vi.fn(),
  pinDocument: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/business/client/hooks/useHasActiveWorkspace', () => ({
  useHasActiveWorkspace: () => mocks.hasActiveWorkspace,
}));
vi.mock('@/components/Modal', () => ({ useModalContext: () => ({ close: mocks.close }) }));
vi.mock('@/hooks/usePermission', () => ({ usePermission: () => ({ allowed: mocks.canEdit }) }));
vi.mock('@/libs/swr', () => ({ mutate: mocks.refresh }));
vi.mock('@/services/taskMenu', () => ({ taskMenuService: { addLink: mocks.addLink } }));
vi.mock('@/services/document', () => ({
  documentService: { createDocument: mocks.createDocument },
}));
vi.mock('@/services/task', () => ({ taskService: { pinDocument: mocks.pinDocument } }));
vi.mock('@/features/DocumentModal/loader', () => ({ openDocumentModal: mocks.openDocument }));

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.canEdit = true;
  mocks.hasActiveWorkspace = true;
  mocks.addLink.mockResolvedValue({ success: true });
  mocks.refresh.mockResolvedValue(undefined);
  mocks.createDocument.mockResolvedValue({ id: 'doc-created' });
  mocks.pinDocument.mockResolvedValue(undefined);
  mocks.openDocument.mockResolvedValue(undefined);
});

describe('issue resource mutations', () => {
  it('persists the link under the modal issue id before refreshing and closing', async () => {
    const changed = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useTaskIssueResourceMutation({ taskId: 'task-a', kind: 'link', onChanged: changed }),
    );
    await act(() =>
      result.current.save({ url: ' https://example.com/docs ', title: ' Reference docs ' }),
    );
    expect(mocks.addLink).toHaveBeenCalledWith({
      id: 'task-a',
      kind: 'link',
      title: 'Reference docs',
      url: 'https://example.com/docs',
    });
    expect(mocks.refresh).toHaveBeenCalledWith(['issue-resources', 'task-a']);
    expect(changed).toHaveBeenCalledOnce();
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it('attaches the selected authorized PR URL without writing to GitHub', async () => {
    const { result } = renderHook(() =>
      useTaskIssueResourceMutation({
        taskId: 'task-a',
        kind: 'pull_request',
        onChanged: vi.fn().mockResolvedValue(undefined),
      }),
    );
    await act(() =>
      result.current.save({ title: 'Fix export', url: 'https://github.com/org/repo/pull/42' }),
    );
    expect(mocks.addLink).toHaveBeenCalledWith({
      id: 'task-a',
      kind: 'pull_request',
      title: 'Fix export',
      url: 'https://github.com/org/repo/pull/42',
    });
  });

  it.each([true, false])(
    'creates an attachable document in the Issue scope (workspace=%s)',
    async (workspace) => {
      mocks.hasActiveWorkspace = workspace;
      mocks.createDocument.mockImplementation(async (input: { visibility?: string }) => ({
        id: workspace && input.visibility !== 'public' ? 'private-workspace-doc' : 'scoped-doc',
      }));
      mocks.pinDocument.mockImplementation(async (_taskId: string, documentId: string) => {
        if (documentId === 'private-workspace-doc')
          throw new Error('Shared Issue requires a public Document');
      });
      const { result } = renderHook(() =>
        useTaskIssueResourceMutation({
          taskId: 'task-a',
          kind: 'document',
          onChanged: vi.fn().mockResolvedValue(undefined),
        }),
      );
      await act(() => result.current.save({ title: 'Issue notes' }));
      expect(result.current.documentAttached).toBe(true);
      expect(result.current.failure).toBeUndefined();
      expect(mocks.close).toHaveBeenCalledOnce();
      expect(mocks.createDocument.mock.calls[0][0].visibility).toBe(
        workspace ? 'public' : undefined,
      );
    },
  );

  it('retains a created document after pin failure and retries the same document', async () => {
    mocks.pinDocument.mockRejectedValueOnce(new Error('Pin unavailable'));
    const { result } = renderHook(() =>
      useTaskIssueResourceMutation({
        taskId: 'task-a',
        kind: 'document',
        onChanged: vi.fn().mockResolvedValue(undefined),
      }),
    );
    await act(() => result.current.save({ title: 'Project notes' }));
    expect(result.current.createdDocumentId).toBe('doc-created');
    expect(result.current.documentAttached).toBe(false);
    expect(result.current.failure).toBeTruthy();
    expect(mocks.close).not.toHaveBeenCalled();
    await act(() => result.current.save({ title: 'Changed title' }));
    expect(mocks.createDocument).toHaveBeenCalledOnce();
    expect(mocks.pinDocument).toHaveBeenNthCalledWith(2, 'task-a', 'doc-created');
    expect(mocks.openDocument).toHaveBeenCalledWith('doc-created');
    expect(result.current.documentAttached).toBe(true);
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it('keeps the modal open if opening the attached document fails and retries without repinning', async () => {
    mocks.openDocument.mockRejectedValueOnce(new Error('Editor unavailable'));
    const { result } = renderHook(() =>
      useTaskIssueResourceMutation({
        taskId: 'task-a',
        kind: 'document',
        onChanged: vi.fn().mockResolvedValue(undefined),
      }),
    );
    await act(() => result.current.save({ title: 'Project notes' }));
    expect(result.current.documentAttached).toBe(true);
    expect(result.current.failure).toBeTruthy();
    expect(mocks.close).not.toHaveBeenCalled();
    await act(() => result.current.save({}));
    expect(mocks.pinDocument).toHaveBeenCalledOnce();
    expect(mocks.createDocument).toHaveBeenCalledOnce();
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it('refuses a delayed submit after edit permission is revoked', async () => {
    const { result, rerender } = renderHook(() =>
      useTaskIssueResourceMutation({ taskId: 'task-a', kind: 'link', onChanged: vi.fn() }),
    );
    mocks.canEdit = false;
    rerender();
    await act(() => result.current.save({ url: 'https://example.com' }));
    expect(mocks.addLink).not.toHaveBeenCalled();
  });

  it('does not close or report success when persisting a link fails', async () => {
    mocks.addLink.mockRejectedValueOnce(new Error('Write denied'));
    const changed = vi.fn();
    const { result } = renderHook(() =>
      useTaskIssueResourceMutation({ taskId: 'task-a', kind: 'link', onChanged: changed }),
    );
    await act(() => result.current.save({ url: 'https://example.com' }));
    expect(result.current.failure).toBeTruthy();
    expect(result.current.pending).toBe(false);
    expect(changed).not.toHaveBeenCalled();
    expect(mocks.close).not.toHaveBeenCalled();
  });
});

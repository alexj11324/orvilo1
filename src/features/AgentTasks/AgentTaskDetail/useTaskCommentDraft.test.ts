import type { IEditor } from '@lobehub/editor';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useTaskCommentDraft } from './useTaskCommentDraft';

const mock = vi.hoisted(() => ({
  attachments: [] as string[],
  delete: vi.fn(),
  get: vi.fn(),
  mutate: vi.fn(),
  upsert: vi.fn(),
  workspaceId: 'workspace-1' as string | null,
}));

vi.mock('@/business/client/hooks/useActiveWorkspaceId', () => ({
  useActiveWorkspaceId: () => mock.workspaceId,
}));
vi.mock('@/features/EditorCanvas/editorAttachments', () => ({
  getAttachmentFileIdsFromEditor: () => mock.attachments,
  getAttachmentFileIdsFromJson: () => mock.attachments,
}));
vi.mock('@/libs/swr', () => ({ mutate: mock.mutate }));
vi.mock('@/services/taskDraft', () => ({
  taskDraftKeys: { count: () => 'count', list: () => 'list' },
  taskDraftService: { delete: mock.delete, get: mock.get, upsert: mock.upsert },
}));

const editor = {
  getDocument: vi.fn((format: string) =>
    format === 'markdown'
      ? 'An unsent comment'
      : { root: { children: [{ text: 'An unsent comment' }] } },
  ),
  setDocument: vi.fn(),
} as unknown as IEditor;

describe('task comment draft', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mock.attachments = [];
    mock.workspaceId = 'workspace-1';
    mock.get.mockReset().mockResolvedValue({ data: null });
    mock.upsert.mockReset().mockResolvedValue({ data: {} });
    mock.delete.mockReset().mockResolvedValue({ data: true });
    mock.mutate.mockReset().mockResolvedValue(undefined);
    vi.mocked(editor.setDocument).mockClear();
    vi.mocked(editor.getDocument).mockImplementation((format: string) =>
      format === 'markdown'
        ? 'An unsent comment'
        : { root: { children: [{ text: 'An unsent comment' }] } },
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('restores the rich editor document from an existing issue draft', async () => {
    mock.get.mockResolvedValue({
      data: { content: 'Saved', editorData: { root: { children: [{ text: 'Saved' }] } } },
    });
    const onRestore = vi.fn();
    renderHook(() => useTaskCommentDraft('task-1', editor, true, onRestore, vi.fn()));
    await act(async () => {});

    expect(editor.setDocument).toHaveBeenCalledWith(
      'json',
      JSON.stringify({ root: { children: [{ text: 'Saved' }] } }),
    );
    expect(onRestore).toHaveBeenCalledWith('Saved', false);
  });

  it('waits for an in-flight autosave before clearing a sent comment', async () => {
    let finishSave!: () => void;
    mock.upsert.mockReturnValue(
      new Promise((resolve) => {
        finishSave = () => resolve({ data: {} });
      }),
    );
    const { result } = renderHook(() =>
      useTaskCommentDraft('task-1', editor, true, vi.fn(), vi.fn()),
    );
    await act(async () => {});
    act(() => {
      result.current.onChange();
      vi.advanceTimersByTime(300);
    });
    await act(async () => {});
    expect(mock.upsert).toHaveBeenCalledTimes(1);

    let cleared!: Promise<void>;
    act(() => {
      cleared = result.current.clearAfterSend();
    });
    expect(mock.delete).not.toHaveBeenCalled();
    await act(async () => {
      finishSave();
      await cleared;
    });
    expect(mock.delete).toHaveBeenCalledWith('task-1', 'workspace-1');
    expect(mock.upsert).toHaveBeenCalledTimes(1);
    expect(mock.upsert.mock.invocationCallOrder[0]).toBeLessThan(
      mock.delete.mock.invocationCallOrder[0],
    );
  });

  it('preserves attachment-only drafts with empty markdown', async () => {
    mock.attachments = ['file-1'];
    vi.mocked(editor.getDocument).mockImplementation((format: string) =>
      format === 'markdown' ? '' : { root: { children: [{ type: 'file' }] } },
    );
    const { result } = renderHook(() =>
      useTaskCommentDraft('task-1', editor, true, vi.fn(), vi.fn()),
    );
    await act(async () => {});
    act(() => {
      result.current.onChange();
      vi.advanceTimersByTime(300);
    });
    await act(async () => {});
    expect(mock.upsert).toHaveBeenCalledWith(
      {
        content: '',
        editorData: {
          attachments: [],
          document: { root: { children: [{ type: 'file' }] } },
          version: 1,
        },
        taskId: 'task-1',
      },
      'workspace-1',
    );
    expect(mock.delete).not.toHaveBeenCalled();
  });

  it.each([
    ['workspace-1', 'workspace-2'],
    [null, 'workspace-2'],
  ] as const)(
    'keeps a delayed save in its originating scope (%s to %s)',
    async (origin, destination) => {
      mock.workspaceId = origin;
      const { result, rerender } = renderHook(() =>
        useTaskCommentDraft('task-1', editor, true, vi.fn(), vi.fn()),
      );
      await act(async () => {});
      act(() => result.current.onChange());

      mock.workspaceId = destination;
      rerender();
      act(() => vi.advanceTimersByTime(300));
      await act(async () => {});

      expect(mock.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ taskId: 'task-1' }),
        origin,
      );
    },
  );
});

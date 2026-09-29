import type { IEditor } from '@lobehub/editor';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useAttachInstructionFiles } from './useAttachInstructionFiles';

const { pickAndInsertAttachments, toastError } = vi.hoisted(() => ({
  pickAndInsertAttachments: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/features/EditorCanvas/editorAttachments', () => ({ pickAndInsertAttachments }));
vi.mock('@lobehub/ui/base-ui', () => ({ toast: { error: toastError } }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const editor = { getLexicalEditor: () => ({ dispatchCommand: vi.fn() }) } as unknown as IEditor;

const render = (editable: boolean, taskId: string | null = 'task-1') =>
  renderHook(
    (props: { editable: boolean; taskId: string | null }) =>
      useAttachInstructionFiles({
        editable: props.editable,
        editor,
        taskId: props.taskId,
      }),
    { initialProps: { editable, taskId } },
  );

const lastGuard = () => {
  const call = pickAndInsertAttachments.mock.calls.at(-1);
  return call?.[2] as { canInsert: () => boolean; onBlocked?: () => void } | undefined;
};

describe('useAttachInstructionFiles', () => {
  it('opens the picker with an insert guard for the current task', () => {
    const { result } = render(true);
    result.current();

    expect(pickAndInsertAttachments).toHaveBeenCalledWith(editor, undefined, {
      canInsert: expect.any(Function),
      onBlocked: expect.any(Function),
    });
    expect(lastGuard()?.canInsert()).toBe(true);
  });

  it('rejects a resolution after the user switched tasks mid-pick', () => {
    const { rerender, result } = render(true);
    result.current();

    rerender({ editable: true, taskId: 'task-2' });

    expect(lastGuard()?.canInsert()).toBe(false);
  });

  it('rejects a resolution after edit rights were lost mid-pick', () => {
    const { rerender, result } = render(true);
    result.current();

    rerender({ editable: false, taskId: 'task-1' });

    expect(lastGuard()?.canInsert()).toBe(false);
  });

  it('rejects a resolution after unmount', () => {
    const { result, unmount } = render(true);
    result.current();

    unmount();

    expect(lastGuard()?.canInsert()).toBe(false);
  });

  it('keeps allowing inserts that resolve on the same task while editable', () => {
    const { rerender, result } = render(true);
    result.current();

    rerender({ editable: true, taskId: 'task-1' });

    expect(lastGuard()?.canInsert()).toBe(true);
  });

  it('explains a blocked pick with the unavailable toast', () => {
    const { result } = render(true);
    result.current();

    lastGuard()?.onBlocked?.();

    expect(toastError).toHaveBeenCalledWith('taskDetail.attachmentsUnavailable');
  });

  it('opens a new pick bound to the new task after switching', () => {
    const { rerender, result } = render(true);
    result.current();
    rerender({ editable: true, taskId: 'task-2' });
    result.current();

    expect(pickAndInsertAttachments).toHaveBeenCalledTimes(2);
    expect(lastGuard()?.canInsert()).toBe(true);
  });
});

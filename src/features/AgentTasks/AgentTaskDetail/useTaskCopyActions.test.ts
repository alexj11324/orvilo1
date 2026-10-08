/**
 * @vitest-environment happy-dom
 */
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useTaskCopyActions } from './useTaskCopyActions';

const mocks = vi.hoisted(() => ({
  copyToClipboard: vi.fn(),
  taskState: {
    activeTaskId: 'T-1' as string | undefined,
    taskDetailMap: {
      'T-1': { agentId: 'agt_1', name: 'Ship the thing' },
    } as Record<string, Record<string, unknown>>,
  },
  toastSuccess: vi.fn(),
  workspaceSlug: 'ws-slug' as string | undefined,
}));

Object.defineProperty(navigator, 'clipboard', {
  configurable: true,
  value: { writeText: mocks.copyToClipboard },
});

vi.mock('@/components/toast', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  toast: { success: mocks.toastSuccess },
}));

vi.mock('@/business/client/hooks/useActiveWorkspaceSlug', () => ({
  useActiveWorkspaceSlug: () => mocks.workspaceSlug,
}));

vi.mock('@/hooks/useAppOrigin', () => ({
  useAppOrigin: () => 'https://example.com',
}));

vi.mock('@/store/task', () => ({
  useTaskStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector(mocks.taskState),
}));

describe('useTaskCopyActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.taskState.activeTaskId = 'T-1';
    mocks.taskState.taskDetailMap = { 'T-1': { agentId: 'agt_1', name: 'Ship the thing' } };
    mocks.workspaceSlug = 'ws-slug';
  });

  it('copies an absolute, workspace-aware link carrying the readable slug', async () => {
    const { result } = renderHook(() => useTaskCopyActions());

    await result.current.copyLink();

    expect(mocks.copyToClipboard).toHaveBeenCalledWith(
      'https://example.com/ws-slug/agent/agt_1/task/T-1/ship-the-thing',
    );
    expect(mocks.toastSuccess).toHaveBeenCalledWith('taskList.contextMenu.copyLinkSuccess');
  });

  it('drops the workspace prefix in personal mode', async () => {
    mocks.workspaceSlug = undefined;
    const { result } = renderHook(() => useTaskCopyActions());

    await result.current.copyLink();

    expect(mocks.copyToClipboard).toHaveBeenCalledWith(
      'https://example.com/agent/agt_1/task/T-1/ship-the-thing',
    );
  });

  it('copies the bare task id', async () => {
    const { result } = renderHook(() => useTaskCopyActions());

    await result.current.copyId();

    expect(mocks.copyToClipboard).toHaveBeenCalledWith('T-1');
    expect(mocks.toastSuccess).toHaveBeenCalledWith('taskList.contextMenu.copyIdSuccess');
  });

  it('copies the title, and the title as a Markdown link to the task', async () => {
    const { result } = renderHook(() => useTaskCopyActions());

    await result.current.copyTitle();
    expect(mocks.copyToClipboard).toHaveBeenLastCalledWith('Ship the thing');
    expect(mocks.toastSuccess).toHaveBeenLastCalledWith('taskList.contextMenu.copyTitleSuccess');

    await result.current.copyTitleAsLink();
    expect(mocks.copyToClipboard).toHaveBeenLastCalledWith(
      '[Ship the thing](https://example.com/ws-slug/agent/agt_1/task/T-1/ship-the-thing)',
    );
    expect(mocks.toastSuccess).toHaveBeenLastCalledWith('taskList.contextMenu.copyLinkSuccess');
  });

  it('falls back to the identifier as the title of an untitled task', async () => {
    mocks.taskState.taskDetailMap = { 'T-1': { agentId: 'agt_1', identifier: 'ENG-7' } };
    const { result } = renderHook(() => useTaskCopyActions());

    await result.current.copyTitle();

    expect(mocks.copyToClipboard).toHaveBeenCalledWith('ENG-7');
  });

  it('copies the issue as Markdown: heading, description, then the link', async () => {
    mocks.taskState.taskDetailMap = {
      'T-1': {
        agentId: 'agt_1',
        identifier: 'ENG-7',
        instruction: 'Do the work.\n',
        name: 'Ship the thing',
      },
    };
    const { result } = renderHook(() => useTaskCopyActions());

    await result.current.copyMarkdown();

    expect(mocks.copyToClipboard).toHaveBeenCalledWith(
      '# ENG-7: Ship the thing\n\nDo the work.\n\nhttps://example.com/ws-slug/agent/agt_1/task/T-1/ship-the-thing',
    );
    expect(mocks.toastSuccess).toHaveBeenCalledWith('taskList.contextMenu.copyMarkdownSuccess');
  });

  it('omits the description block from the Markdown of a task without one', async () => {
    const { result } = renderHook(() => useTaskCopyActions());

    await result.current.copyMarkdown();

    expect(mocks.copyToClipboard).toHaveBeenCalledWith(
      '# T-1: Ship the thing\n\nhttps://example.com/ws-slug/agent/agt_1/task/T-1/ship-the-thing',
    );
  });

  it('no-ops while no task is active, so the header buttons cannot copy a stale id', async () => {
    mocks.taskState.activeTaskId = undefined;
    const { result } = renderHook(() => useTaskCopyActions());

    await result.current.copyId();
    await result.current.copyLink();
    await result.current.copyTitle();
    await result.current.copyTitleAsLink();
    await result.current.copyMarkdown();

    expect(mocks.copyToClipboard).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });

  it('copies the `task/<identifier>` branch only when the task is workspace-bound', async () => {
    // No workspace binding → no branch exists, so the action must not surface.
    const plain = renderHook(() => useTaskCopyActions());
    expect(plain.result.current.hasBranch).toBe(false);
    await plain.result.current.copyBranch();
    expect(mocks.copyToClipboard).not.toHaveBeenCalled();
    plain.unmount();

    mocks.taskState.taskDetailMap = {
      'T-1': {
        agentId: 'agt_1',
        config: { workspace: { provider: 'git', repoPath: '/repo' } },
        identifier: 'T-1',
        name: 'Ship the thing',
      },
    };
    const bound = renderHook(() => useTaskCopyActions());
    expect(bound.result.current.hasBranch).toBe(true);
    await bound.result.current.copyBranch();
    expect(mocks.copyToClipboard).toHaveBeenCalledWith('task/T-1');
    expect(mocks.toastSuccess).toHaveBeenCalledWith('taskDetail.copyBranchSuccess');
  });
});

/**
 * @vitest-environment happy-dom
 */
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useTaskCopyActions } from './useTaskCopyActions';

const mocks = vi.hoisted(() => ({
  copyToClipboard: vi.fn(),
  links: vi.fn(),
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

vi.mock('@/services/taskMenu', () => ({ taskMenuService: { links: mocks.links } }));

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
    mocks.links.mockResolvedValue({ data: [] });
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

  it('copies the readable identifier when the detail host is mounted by UUID', async () => {
    mocks.taskState.activeTaskId = 'task-uuid';
    mocks.taskState.taskDetailMap = { 'task-uuid': { identifier: 'ENG-42', name: 'Issue' } };
    const { result } = renderHook(() => useTaskCopyActions());

    await result.current.copyId();
    expect(mocks.copyToClipboard).toHaveBeenLastCalledWith('ENG-42');

    await result.current.copyLink();
    expect(mocks.copyToClipboard).toHaveBeenLastCalledWith(
      'https://example.com/ws-slug/task/ENG-42/issue',
    );
    expect(result.current.taskPath).toBe('/task/ENG-42/issue');
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
      '# ENG-7: Ship the thing\n\nDo the work.\n\nhttps://example.com/ws-slug/agent/agt_1/task/ENG-7/ship-the-thing',
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

  it('copies everything readable: issue, links, relations, sub-issues, documents, comments', async () => {
    mocks.taskState.taskDetailMap = {
      'T-1': {
        activities: [
          { content: 'First **comment**', type: 'comment' },
          { content: 'not a comment', type: 'topic' },
        ],
        agentId: 'agt_1',
        dependencies: [{ dependsOn: 'ENG-5', name: 'Blocker', type: 'blocks' }],
        id: 'task-uuid-1',
        identifier: 'ENG-7',
        instruction: 'Do the work.',
        name: 'Ship the thing',
        subtasks: [{ identifier: 'ENG-8', name: 'Child' }],
        workspace: [{ title: 'Notes' }, { inaccessible: true, title: 'Secret notes' }],
      },
    };
    mocks.links.mockResolvedValue({
      data: [{ kind: 'link', title: 'Spec', url: 'https://example.com/spec' }],
    });
    const { result } = renderHook(() => useTaskCopyActions());

    await result.current.copyEverything();

    expect(mocks.links).toHaveBeenCalledWith('task-uuid-1');
    expect(mocks.copyToClipboard).toHaveBeenCalledWith(
      [
        '# ENG-7: Ship the thing',
        'Do the work.',
        'https://example.com/ws-slug/agent/agt_1/task/ENG-7/ship-the-thing',
        '[Spec](https://example.com/spec)',
        'blocks: ENG-5 Blocker',
        'ENG-8: Child',
        'Notes',
        'First **comment**',
      ].join('\n\n'),
    );
    expect(mocks.toastSuccess).toHaveBeenCalledWith('copySuccess');
  });

  it('keeps a hostile link title inside its label when copying everything', async () => {
    mocks.links.mockResolvedValue({
      data: [{ kind: 'link', title: 'x](javascript:alert(1)) [y', url: 'https://example.com/a b' }],
    });
    const { result } = renderHook(() => useTaskCopyActions());

    await result.current.copyEverything();

    const copied = mocks.copyToClipboard.mock.calls[0][0] as string;
    expect(copied).toContain(String.raw`[x\](javascript:alert(1)) \[y](https://example.com/a%20b)`);
  });

  it('does not report success when the attached links cannot be read', async () => {
    mocks.links.mockRejectedValue(new Error('Links unavailable'));
    const { result } = renderHook(() => useTaskCopyActions());

    await expect(result.current.copyEverything()).rejects.toThrow('Links unavailable');

    expect(mocks.copyToClipboard).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });

  it('copies a plain-text prompt naming the issue, its description and its link', async () => {
    mocks.taskState.taskDetailMap = {
      'T-1': {
        agentId: 'agt_1',
        identifier: 'ENG-7',
        instruction: 'Do the work.',
        name: 'Ship the thing',
      },
    };
    const { result } = renderHook(() => useTaskCopyActions());

    await result.current.copyPrompt();

    expect(mocks.copyToClipboard).toHaveBeenCalledWith(
      'Work on ENG-7: Ship the thing\n\nDo the work.\n\nIssue: https://example.com/ws-slug/agent/agt_1/task/ENG-7/ship-the-thing',
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
    await result.current.copyEverything();
    await result.current.copyPrompt();

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

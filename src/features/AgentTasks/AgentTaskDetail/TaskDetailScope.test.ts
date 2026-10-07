/**
 * @vitest-environment happy-dom
 */
import type { IEditor } from '@lobehub/editor';
import { cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as referenceActions from '@/features/EditorCanvas/descriptionReferences/actions';
import { taskDetailSelectors } from '@/store/task/selectors';

import TaskArtifacts from './TaskArtifacts';
import {
  useRegisterTaskDescriptionEditor,
  useTaskDescriptionReferenceActions,
} from './TaskDescriptionReferenceProvider';
import { TaskDetailScope, useTaskDetailSelector, useTaskDetailTaskId } from './TaskDetailScope';
import TaskDetailSections from './TaskDetailSections';

const mocks = vi.hoisted(() => ({
  canEdit: true,
  openDocument: vi.fn(),
  taskState: {} as any,
}));

vi.mock('@/hooks/usePermission', () => ({ usePermission: () => ({ allowed: mocks.canEdit }) }));
vi.mock('@/features/DocumentModal/loader', () => ({ openDocumentModal: mocks.openDocument }));
vi.mock('@/features/Home/components/Time', () => ({ default: () => null }));
vi.mock('@/features/NavPanel/components/SidebarDropdownMenu', () => ({
  default: () =>
    createElement('button', { 'data-testid': 'artifact-remove-menu' }, 'Remove artifact'),
}));
vi.mock('@/features/AgentTasks/shared/LinearTaskSyncStatus', () => ({
  LinearTaskSyncProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('./TaskDetailTitleInput', () => ({
  default: () => createElement('h2', {}, 'Issue title'),
}));
vi.mock('./TaskParentBar', () => ({ default: () => createElement('div', {}, 'Parent issue') }));
vi.mock('./TaskDuplicateRelation', () => ({ TaskDuplicateRelation: () => null }));
vi.mock('./TaskInstruction', () => ({
  default: () => createElement('p', {}, 'Issue description'),
}));
vi.mock('./TaskProperties', () => ({
  default: () => createElement('button', { 'aria-label': 'Status value' }, 'Todo'),
}));
vi.mock('./TaskProjectSection', () => ({
  default: () => createElement('button', { 'aria-label': 'Project value' }, 'Configured project'),
}));
vi.mock('./TaskRailActions', () => ({ default: () => null }));
vi.mock('./TaskDetailAssignee', () => ({
  default: () => createElement('button', { 'aria-label': 'Agent assignee' }, 'Agent'),
}));
vi.mock('./TaskPrerequisites', () => ({ TaskBlockedNotice: () => null }));
vi.mock('./TaskSubtasks', () => ({ default: () => null }));
vi.mock('./TaskActivities', () => ({ default: () => null }));
vi.mock('./TaskIssueResources', () => ({ default: () => null }));

afterEach(cleanup);

vi.mock('@/store/task', () => {
  const useTaskStore = (selector?: any) =>
    selector === undefined ? mocks.taskState : selector(mocks.taskState);
  useTaskStore.getState = () => mocks.taskState;
  return { useTaskStore };
});

const probe = () => {
  const taskId = useTaskDetailTaskId();
  const name = useTaskDetailSelector(taskDetailSelectors.taskName);
  return `${taskId}:${name ?? ''}`;
};

const scope = (taskId?: string) => {
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(TaskDetailScope, { children, taskId });
  return wrapper;
};

describe('TaskDetailScope', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.canEdit = true;
    mocks.openDocument.mockClear();
    mocks.taskState = {
      activeTaskId: 'T-B',
      taskDetailMap: {
        'T-A': { name: 'Alpha' },
        'T-B': { name: 'Beta' },
      },
    };
  });

  it('binds the subtree to the scope taskId even when activeTaskId points elsewhere', () => {
    const { result } = renderHook(probe, { wrapper: scope('T-A') });
    expect(result.current).toBe('T-A:Alpha');
  });

  it('keeps pinned documents readable but hides their removal menu for a read-only viewer', () => {
    mocks.canEdit = false;
    mocks.taskState.taskDetailMap['T-A'].workspace = [
      { documentId: 'doc-a', title: 'Readable document' },
    ];
    render(createElement(TaskDetailScope, { taskId: 'T-A' }, createElement(TaskArtifacts)));
    expect(screen.queryByTestId('artifact-remove-menu')).toBeNull();
    fireEvent.click(screen.getByText('Readable document'));
    expect(mocks.openDocument).toHaveBeenCalledWith('doc-a');
  });

  it('mounts one properties region after title context and before description', () => {
    mocks.taskState.taskDetailMap['T-A'].id = 'task-a';
    const view = render(
      createElement(TaskDetailScope, { taskId: 'T-A' }, createElement(TaskDetailSections)),
    );
    const title = screen.getByRole('heading', { name: 'Issue title' });
    const parent = screen.getByText('Parent issue');
    const properties = screen.getByRole('button', { name: 'Status value' });
    const description = screen.getByText('Issue description');
    expect(title.compareDocumentPosition(parent) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      parent.compareDocumentPosition(properties) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      properties.compareDocumentPosition(description) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(view.container.querySelectorAll('[data-task-detail-side]')).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Status value' })).toHaveLength(1);
  });

  it.each([undefined, 'project-a'])(
    'mounts exactly one project picker for empty or configured project %s',
    (projectId) => {
      mocks.taskState.taskDetailMap['T-A'].projectId = projectId;
      render(createElement(TaskDetailScope, { taskId: 'T-A' }, createElement(TaskDetailSections)));
      expect(screen.getAllByRole('button', { name: 'Project value' })).toHaveLength(1);
    },
  );

  it('falls back to the global activeTaskId outside a scope', () => {
    const { result } = renderHook(probe);
    expect(result.current).toBe('T-B:Beta');
  });

  it('keeps reading task A after the global slot is claimed by task B — no cross-talk', () => {
    mocks.taskState.activeTaskId = 'T-A';
    const { result, rerender } = renderHook(probe, { wrapper: scope('T-A') });
    expect(result.current).toBe('T-A:Alpha');

    // A second detail host mounts and steals the shared activeTaskId slot.
    mocks.taskState.activeTaskId = 'T-B';
    rerender();

    expect(result.current).toBe('T-A:Alpha');
  });

  it('lets the innermost scope win when hosts nest', () => {
    const outer = scope('T-A');
    const { result } = renderHook(probe, {
      wrapper: ({ children }) =>
        outer({ children: createElement(TaskDetailScope, { children, taskId: 'T-B' }) }),
    });
    expect(result.current).toBe('T-B:Beta');
  });

  it('revalidates a delayed reference insertion after edit rights change or the host unmounts', () => {
    const insert = vi.spyOn(referenceActions, 'insertDescriptionReference').mockReturnValue(true);
    const editor = {} as IEditor;
    const { result, rerender, unmount } = renderHook(
      ({ editable }) => {
        useRegisterTaskDescriptionEditor(editor, editable, 'https://orvilo.example');
        return useTaskDescriptionReferenceActions();
      },
      { initialProps: { editable: true }, wrapper: scope('T-A') },
    );
    const delayedInsert = result.current.insertReference;
    expect(result.current.canInsert).toBe(true);
    expect(delayedInsert('/task/T-7')).toBe(true);
    insert.mockClear();
    rerender({ editable: false });
    expect(result.current.canInsert).toBe(false);
    expect(delayedInsert('/task/T-7')).toBe(false);
    expect(insert).not.toHaveBeenCalled();
    unmount();
    expect(delayedInsert('/task/T-7')).toBe(false);
  });

  it('keeps description editor actions bound to their own routed/portal host', () => {
    const insert = vi.spyOn(referenceActions, 'insertDescriptionReference').mockReturnValue(true);
    const editorA = {} as IEditor;
    const editorB = {} as IEditor;
    const useBoundActions = (editor: IEditor) => {
      useRegisterTaskDescriptionEditor(editor, true, 'https://orvilo.example');
      return useTaskDescriptionReferenceActions();
    };
    const a = renderHook(() => useBoundActions(editorA), { wrapper: scope('T-A') });
    const b = renderHook(() => useBoundActions(editorB), { wrapper: scope('T-B') });
    mocks.taskState.activeTaskId = 'T-B';
    a.result.current.insertReference('/task/T-7');
    b.result.current.insertReference('/task/T-8');
    expect(insert.mock.calls).toEqual([
      [editorA, '/task/T-7', 'https://orvilo.example'],
      [editorB, '/task/T-8', 'https://orvilo.example'],
    ]);
  });

  it('rejects an old picker callback after the same host switches Issue', () => {
    const insert = vi.spyOn(referenceActions, 'insertDescriptionReference').mockReturnValue(true);
    const editor = {} as IEditor;
    let taskId = 'T-A';
    const { result, rerender } = renderHook(
      () => {
        useRegisterTaskDescriptionEditor(editor, true, 'https://orvilo.example');
        return useTaskDescriptionReferenceActions();
      },
      { wrapper: ({ children }) => createElement(TaskDetailScope, { children, taskId }) },
    );
    const oldPickerCallback = result.current.insertReference;
    taskId = 'T-B';
    rerender();
    expect(oldPickerCallback('/task/T-7')).toBe(false);
    expect(insert).not.toHaveBeenCalled();
    expect(result.current.insertReference('/task/T-7')).toBe(true);
  });
});

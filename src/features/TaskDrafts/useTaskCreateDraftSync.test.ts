import type { IEditor } from '@lobehub/editor';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getTaskCreateDraft,
  listTaskCreateDrafts,
  saveTaskCreateDraft,
  type TaskCreateDraft,
  type TaskCreateDraftFields,
} from './taskCreateDrafts';
import { useTaskCreateDraftSync } from './useTaskCreateDraftSync';

const EMPTY_DOCUMENT = {
  root: { children: [], direction: null, format: '', indent: 0, type: 'root', version: 1 },
};

const makeEditor = (markdown: string) =>
  ({
    getDocument: vi.fn((format: string) => (format === 'markdown' ? markdown : EMPTY_DOCUMENT)),
    getLexicalEditor: vi.fn(() => ({})),
    setDocument: vi.fn(),
  }) as unknown as IEditor;

const baseFields: TaskCreateDraftFields = {
  assigneeAgentId: 'agent-1',
  priority: 2,
  title: 'Draft title',
  visibility: 'public',
};

const storedDraft = (overrides: Partial<TaskCreateDraft> = {}): TaskCreateDraft => ({
  content: 'Draft body',
  createdAt: 1,
  hasAttachments: false,
  id: 'draft-1',
  priority: 2,
  title: 'Draft title',
  updatedAt: 1,
  ...overrides,
});

interface HookProps {
  applyDraft: (draft: TaskCreateDraft, markdown: string) => void;
  draft?: TaskCreateDraft;
  editor: IEditor | undefined;
  enabled: boolean;
  fields: TaskCreateDraftFields;
  workspaceId: string | null;
}

const renderSync = (props: HookProps) =>
  renderHook((p: HookProps) => useTaskCreateDraftSync(p), { initialProps: props });

describe('useTaskCreateDraftSync', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('maps a stored draft onto the composer: editor json + scalar fields', () => {
    const draft = storedDraft({
      editorData: {
        document: EMPTY_DOCUMENT,
        version: 1,
      },
    });
    const editor = makeEditor('Draft body');
    const applyDraft = vi.fn();

    renderSync({
      applyDraft,
      draft,
      editor,
      enabled: true,
      fields: baseFields,
      workspaceId: 'ws-1',
    });

    expect(editor.setDocument).toHaveBeenCalledWith('json', JSON.stringify(EMPTY_DOCUMENT));
    // Composer state mapping: title/priority/assignee/etc. flow through
    // applyDraft; the markdown body is handed back for the instruction ref.
    expect(applyDraft).toHaveBeenCalledWith(draft, 'Draft body');
  });

  it('restores markdown when the draft has no editorData envelope', () => {
    const draft = storedDraft({ editorData: undefined });
    const editor = makeEditor('Draft body');
    const applyDraft = vi.fn();

    renderSync({
      applyDraft,
      draft,
      editor,
      enabled: true,
      fields: baseFields,
      workspaceId: 'ws-1',
    });

    expect(editor.setDocument).toHaveBeenCalledWith('markdown', 'Draft body');
  });

  it('does not persist before the reopened draft has hydrated', () => {
    const draft = storedDraft();
    saveTaskCreateDraft('ws-1', draft);
    const applyDraft = vi.fn();

    // Editor not ready yet — hydration waits, and no empty write can clobber
    // the stored draft.
    renderSync({
      applyDraft,
      draft,
      editor: undefined,
      enabled: true,
      fields: { ...baseFields, title: '' },
      workspaceId: 'ws-1',
    });
    act(() => void vi.advanceTimersByTime(1000));

    expect(getTaskCreateDraft('ws-1', 'draft-1')).toMatchObject({ title: 'Draft title' });
    expect(applyDraft).not.toHaveBeenCalled();
  });

  it('updates the same draft id when the composer edits', () => {
    const draft = storedDraft();
    saveTaskCreateDraft('ws-1', draft);
    const editor = makeEditor('Draft body');
    const props: HookProps = {
      applyDraft: vi.fn(),
      draft,
      editor,
      enabled: true,
      fields: baseFields,
      workspaceId: 'ws-1',
    };
    const { rerender } = renderSync(props);

    rerender({ ...props, fields: { ...baseFields, title: 'Renamed' } });
    act(() => void vi.advanceTimersByTime(500));

    const list = listTaskCreateDrafts('ws-1');
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: 'draft-1', title: 'Renamed', content: 'Draft body' });
  });

  it('deletes the draft when the composer is emptied out', () => {
    const draft = storedDraft();
    saveTaskCreateDraft('ws-1', draft);
    const emptyEditor = makeEditor('');
    const props: HookProps = {
      applyDraft: vi.fn(),
      draft,
      editor: emptyEditor,
      enabled: true,
      fields: baseFields,
      workspaceId: 'ws-1',
    };
    const { rerender } = renderSync(props);

    rerender({ ...props, fields: { ...baseFields, title: '' } });
    act(() => void vi.advanceTimersByTime(500));

    expect(getTaskCreateDraft('ws-1', 'draft-1')).toBeUndefined();
  });

  it('markSubmitted removes the draft and blocks the unmount flush', () => {
    const draft = storedDraft();
    saveTaskCreateDraft('ws-1', draft);
    const editor = makeEditor('Final body');
    const { result, unmount } = renderSync({
      applyDraft: vi.fn(),
      draft,
      editor,
      enabled: true,
      fields: baseFields,
      workspaceId: 'ws-1',
    });

    act(() => result.current.markSubmitted());
    expect(getTaskCreateDraft('ws-1', 'draft-1')).toBeUndefined();

    unmount();
    expect(getTaskCreateDraft('ws-1', 'draft-1')).toBeUndefined();
  });

  it('a fresh composer saves a new draft on close with content', () => {
    const editor = makeEditor('Unsent body');
    const { unmount } = renderSync({
      applyDraft: vi.fn(),
      editor,
      enabled: true,
      fields: { ...baseFields, title: 'New draft' },
      workspaceId: 'ws-1',
    });

    unmount();
    const list = listTaskCreateDrafts('ws-1');
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ content: 'Unsent body', title: 'New draft' });
  });

  it('writes nothing for an empty fresh composer', () => {
    const { unmount } = renderSync({
      applyDraft: vi.fn(),
      editor: makeEditor(''),
      enabled: true,
      fields: { ...baseFields, title: '' },
      workspaceId: 'ws-1',
    });

    unmount();
    expect(listTaskCreateDrafts('ws-1')).toEqual([]);
  });
});

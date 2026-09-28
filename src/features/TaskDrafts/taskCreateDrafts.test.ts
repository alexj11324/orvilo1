import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  getTaskCreateDraft,
  listTaskCreateDrafts,
  removeAllTaskCreateDrafts,
  removeTaskCreateDraft,
  saveTaskCreateDraft,
  taskCreateDraftsKey,
  useTaskCreateDrafts,
} from './taskCreateDrafts';

const fields = {
  assigneeAgentId: 'agent-1',
  priority: 2,
  title: 'Draft title',
  visibility: 'public' as const,
};

const editorData = {
  document: {
    root: {
      children: [{ children: [{ text: 'Body text', type: 'text' }], type: 'paragraph' }],
      type: 'root',
    },
  },
  version: 1,
};

describe('taskCreateDrafts', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('saves and reads a draft back with all composer fields mapped', () => {
    const saved = saveTaskCreateDraft('ws-1', {
      ...fields,
      content: 'Body text',
      editorData,
      hasAttachments: false,
      id: 'd1',
      teamId: 'team-1',
    });

    expect(saved?.id).toBe('d1');
    expect(getTaskCreateDraft('ws-1', 'd1')).toMatchObject({
      ...fields,
      content: 'Body text',
      hasAttachments: false,
      teamId: 'team-1',
    });
  });

  it('lists drafts newest-first by updatedAt', () => {
    const first = saveTaskCreateDraft('ws-1', {
      ...fields,
      content: 'a',
      hasAttachments: false,
      id: 'a',
    })!;
    saveTaskCreateDraft('ws-1', {
      ...fields,
      content: 'b',
      hasAttachments: false,
      id: 'b',
    });
    // Touch the older draft — it must jump ahead of the newer one.
    saveTaskCreateDraft('ws-1', {
      ...fields,
      content: 'a2',
      hasAttachments: false,
      id: 'a',
    });

    const list = listTaskCreateDrafts('ws-1');
    expect(list.map((draft) => draft.id)).toEqual(['a', 'b']);
    expect(list[0].updatedAt).toBeGreaterThan(first.updatedAt);
    expect(list[0].createdAt).toBe(first.createdAt);
  });

  it('scopes drafts per workspace and per personal mode', () => {
    saveTaskCreateDraft('ws-1', { ...fields, content: 'x', hasAttachments: false, id: 'd1' });
    saveTaskCreateDraft(null, { ...fields, content: 'y', hasAttachments: false, id: 'd2' });

    expect(listTaskCreateDrafts('ws-1').map((d) => d.id)).toEqual(['d1']);
    expect(listTaskCreateDrafts('ws-2')).toEqual([]);
    expect(listTaskCreateDrafts(null).map((d) => d.id)).toEqual(['d2']);
    expect(taskCreateDraftsKey(null)).not.toBe(taskCreateDraftsKey('ws-1'));
  });

  it('skips an unchanged write so updatedAt ordering is preserved', () => {
    const saved = saveTaskCreateDraft('ws-1', {
      ...fields,
      content: 'same',
      editorData,
      hasAttachments: false,
      id: 'd1',
    })!;
    const again = saveTaskCreateDraft('ws-1', {
      ...fields,
      content: 'same',
      editorData,
      hasAttachments: false,
      id: 'd1',
    })!;

    expect(again.updatedAt).toBe(saved.updatedAt);
    expect(again.createdAt).toBe(saved.createdAt);
  });

  it('removes a single draft and clears all drafts of the workspace', () => {
    saveTaskCreateDraft('ws-1', { ...fields, content: 'x', hasAttachments: false, id: 'd1' });
    saveTaskCreateDraft('ws-1', { ...fields, content: 'y', hasAttachments: false, id: 'd2' });
    saveTaskCreateDraft('ws-2', { ...fields, content: 'z', hasAttachments: false, id: 'd3' });

    removeTaskCreateDraft('ws-1', 'd1');
    expect(listTaskCreateDrafts('ws-1').map((d) => d.id)).toEqual(['d2']);

    removeAllTaskCreateDrafts('ws-1');
    expect(listTaskCreateDrafts('ws-1')).toEqual([]);
    expect(listTaskCreateDrafts('ws-2').map((d) => d.id)).toEqual(['d3']);
  });

  it('tolerates malformed stored payloads', () => {
    localStorage.setItem(taskCreateDraftsKey('ws-1'), '{not json');
    expect(listTaskCreateDrafts('ws-1')).toEqual([]);

    localStorage.setItem(
      taskCreateDraftsKey('ws-1'),
      JSON.stringify({ bad: { nope: true }, ok: { createdAt: 1, id: 'ok', updatedAt: 2 } }),
    );
    expect(listTaskCreateDrafts('ws-1').map((d) => d.id)).toEqual(['ok']);
  });

  it('useTaskCreateDrafts re-renders subscribers on writes', () => {
    const { result } = renderHook(() => useTaskCreateDrafts('ws-1'));
    expect(result.current).toEqual([]);

    act(() => {
      saveTaskCreateDraft('ws-1', { ...fields, content: 'x', hasAttachments: false, id: 'd1' });
    });
    expect(result.current.map((d) => d.id)).toEqual(['d1']);

    act(() => {
      removeTaskCreateDraft('ws-1', 'd1');
    });
    expect(result.current).toEqual([]);
  });
});

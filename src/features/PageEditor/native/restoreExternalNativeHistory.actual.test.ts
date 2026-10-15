import { createElement } from 'react';
import { describe, expect, it } from 'vitest';

import { createNativeBrowserEditor } from '@/components/NativePageEditor/session';
import { createInitialEditorContentState } from '@/store/document/slices/editor/initialState';

import {
  getNativeHistoryOwner,
  type NativeHistoryOwner,
  registerNativeHistoryOwner,
} from './nativeHistoryOwner';
import { restoreExternalNativeHistory } from './restoreExternalNativeHistory';

type RestoreState = ReturnType<Parameters<typeof restoreExternalNativeHistory>[0]['getState']>;
function fixture() {
  const widgets = {
    code: () => null,
    math: () => null,
    mention: () => null,
    linkCard: () => null,
    linkIframe: () => null,
    linkSchema: () => null,
  };
  const editor = createNativeBrowserEditor(
    () => widgets,
    () => ({
      decorator: () => createElement('span'),
      handleUpload: async () => ({ url: '/f' }),
      theme: {},
    }),
    () => ({
      defaultBlockImage: true,
      getImageWidth: async () => 100,
      handleUpload: async () => ({ url: '/i' }),
      handleRehost: async (url: string) => ({ url }),
      needRehost: () => false,
      render: () => createElement('span'),
    }),
  );
  editor.initNodeEditor();
  editor.setEditable(true);
  editor.setDocument('markdown', '**Unsaved draft**');
  const saves: { source: string | undefined; value: unknown }[] = [];
  const state: RestoreState = {
    activeDocumentId: 'doc',
    editor,
    documents: { doc: createInitialEditorContentState('page', { isDirty: true }) },
    markDirty: (id) => {
      state.documents[id].isDirty = true;
    },
    commitEditorMutation: async (_id, options) => {
      saves.push({ source: options?.saveSource, value: editor.getDocument('json') });
      state.documents.doc.isDirty = false;
    },
  };
  const owner: NativeHistoryOwner = {
    documentId: 'doc',
    editor,
    canRestore: () => editor.getLexicalEditor()?.isEditable() === true,
    beforeRestore: async () => {},
    getRichDiff: () => ({ widgets }),
  };
  const dispose = registerNativeHistoryOwner(owner);
  return { editor, state, owner, saves, dispose };
}

describe('external production native history owner and restore', () => {
  it('saves the current real draft before applying and persisting a historical rich snapshot', async () => {
    const f = fixture();
    try {
      f.editor.setDocument('markdown', '## Historical\n\n**rich** `code`');
      const history = f.editor.getDocument('json');
      f.editor.setDocument('markdown', '**Unsaved draft**');
      await restoreExternalNativeHistory({
        owner: f.owner,
        historyId: 'history',
        getState: () => f.state,
        load: async () => ({ editorData: history }),
      });
      expect(f.saves.map((row) => row.source)).toEqual(['manual', 'restore']);
      expect(JSON.stringify(f.saves[0].value)).toContain('Unsaved draft');
      expect(JSON.stringify(f.saves[1].value)).toContain('Historical');
      expect(f.editor.getDocument('markdown')).toContain('**rich**');
      expect(f.editor.getDocument('markdown')).toContain('`code`');
      expect(f.state.documents.doc.isDirty).toBe(false);
    } finally {
      f.dispose();
      f.editor.destroy();
    }
  });
  it('does not replace a draft if ownership changes while loading history', async () => {
    const f = fixture();
    try {
      const before = JSON.stringify(f.editor.getDocument('json'));
      await expect(
        restoreExternalNativeHistory({
          owner: f.owner,
          historyId: 'old',
          getState: () => f.state,
          load: async () => {
            f.state.activeDocumentId = 'other';
            return { editorData: {} };
          },
        }),
      ).rejects.toThrow('editable document');
      expect(JSON.stringify(f.editor.getDocument('json'))).toBe(before);
      expect(f.saves).toHaveLength(0);
    } finally {
      f.dispose();
      f.editor.destroy();
    }
  });
  it('keeps actual draft data when current-draft persistence fails', async () => {
    const f = fixture();
    try {
      const before = JSON.stringify(f.editor.getDocument('json'));
      f.state.commitEditorMutation = async () => {
        throw new Error('offline');
      };
      await expect(
        restoreExternalNativeHistory({
          owner: f.owner,
          historyId: 'old',
          getState: () => f.state,
          load: async () => ({ editorData: {} }),
        }),
      ).rejects.toThrow('offline');
      expect(JSON.stringify(f.editor.getDocument('json'))).toBe(before);
      expect(f.state.documents.doc.isDirty).toBe(true);
    } finally {
      f.dispose();
      f.editor.destroy();
    }
  });
  it('rejects a live lease change during metadata flush', async () => {
    const f = fixture();
    try {
      const before = JSON.stringify(f.editor.getDocument('json'));
      f.owner.beforeRestore = async () => {
        f.editor.setEditable(false);
      };
      await expect(
        restoreExternalNativeHistory({
          owner: f.owner,
          historyId: 'old',
          getState: () => f.state,
          load: async () => ({ editorData: {} }),
        }),
      ).rejects.toThrow('editable document');
      expect(JSON.stringify(f.editor.getDocument('json'))).toBe(before);
      expect(f.saves).toHaveLength(0);
    } finally {
      f.dispose();
      f.editor.destroy();
    }
  });
  it('preserves both mounted lifetimes of the same document across modal cleanup', () => {
    const page = fixture();
    const modal = fixture();
    try {
      expect(getNativeHistoryOwner('doc', page.state)).toBe(page.owner);
      expect(getNativeHistoryOwner('doc', modal.state)).toBe(modal.owner);
      modal.dispose();
      expect(getNativeHistoryOwner('doc', page.state)).toBe(page.owner);
      expect(getNativeHistoryOwner('doc', modal.state)).toBeUndefined();
    } finally {
      page.dispose();
      modal.dispose();
      page.editor.destroy();
      modal.editor.destroy();
    }
  });
  it('does not let stale cleanup delete a newer registration for the same document', () => {
    const f = fixture();
    const newer = { ...f.owner };
    const disposeNew = registerNativeHistoryOwner(newer);
    try {
      f.dispose();
      expect(getNativeHistoryOwner('doc', f.state)).toBe(newer);
      expect(getNativeHistoryOwner('other', f.state)).toBeUndefined();
      disposeNew();
      expect(getNativeHistoryOwner('doc', f.state)).toBeUndefined();
    } finally {
      disposeNew();
      f.editor.destroy();
    }
  });
});

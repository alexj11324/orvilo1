import { createHeadlessEditor } from '@orvilo/editor-runtime/headless';
import type { ChatContextContent } from '@orvilo/types';
import { beforeEach, describe, expect, it } from 'vitest';

import { useFileStore } from '@/store/file/store';
import type { UploadFileItem } from '@/types/files/upload';

import { getDraft } from '../draftStorage';
import { createStore } from '../store';

const file = (id: string): UploadFileItem => ({
  id,
  file: new File(['body'], `${id}.txt`),
  status: 'success',
});
const context = (id: string): ChatContextContent => ({
  id,
  type: 'text',
  source: 'code',
  content: id,
});

describe('real native composer store transaction', () => {
  beforeEach(() => {
    localStorage.clear();
    useFileStore.setState({ chatUploadFileList: [], chatContextSelectionsByContext: {} });
  });
  it.each([false, true])(
    'restores failed send while preserving newer input=%s and added attachments',
    (newer) => {
      const backend = createHeadlessEditor();
      try {
        backend.kernel.setDocument('markdown', 'Original draft');
        const before = backend.kernel.getDocument('json');
        let restore: (() => void) | undefined;
        const key = 'topic_native';
        const selections = 'native_context';
        useFileStore.setState({
          chatUploadFileList: [file('original')],
          chatContextSelectionsByContext: { [selections]: [context('original')] },
        });
        const store = createStore({
          nativeComposer: backend.kernel,
          draftKey: key,
          contextSelectionKey: selections,
          onSend: (send) => {
            restore = send.restoreDraft;
            send.clearContent();
            useFileStore.getState().clearChatUploadFileList();
            useFileStore.getState().clearChatContextSelections(selections);
          },
        });
        store.getState().handleSendButton();
        if (newer) backend.kernel.setDocument('markdown', 'Newer input');
        useFileStore.setState({
          chatUploadFileList: [file('added')],
          chatContextSelectionsByContext: { [selections]: [context('added')] },
        });
        if (!restore) throw new Error('Real onSend did not receive restore transaction');
        restore();
        restore();
        expect(store.getState().getMarkdownContent()).toBe(
          newer ? 'Newer input' : 'Original draft',
        );
        if (!newer) {
          expect(backend.kernel.getDocument('json')).toEqual(before);
          expect(getDraft(key)).toEqual(before);
        }
        expect(
          useFileStore
            .getState()
            .chatUploadFileList.map((item) => item.id)
            .sort(),
        ).toEqual(['added', 'original']);
        expect(
          useFileStore
            .getState()
            .chatContextSelectionsByContext[selections].map((item) => item.id)
            .sort(),
        ).toEqual(['added', 'original']);
      } finally {
        backend.destroy();
      }
    },
  );
  it('does not restore a failed old send into another conversation or backend', () => {
    const backend = createHeadlessEditor();
    const replacement = createHeadlessEditor();
    try {
      backend.kernel.setDocument('markdown', 'Original');
      replacement.kernel.setDocument('markdown', 'Other');
      let restore: (() => void) | undefined;
      const store = createStore({
        nativeComposer: backend.kernel,
        draftKey: 'old',
        onSend: (send) => {
          restore = send.restoreDraft;
          send.clearContent();
        },
      });
      store.getState().handleSendButton();
      store.setState({ nativeComposer: replacement.kernel, draftKey: 'new' });
      restore?.();
      expect(store.getState().getMarkdownContent()).toBe('Other');
    } finally {
      backend.destroy();
      replacement.destroy();
    }
  });
});

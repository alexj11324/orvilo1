import { createHeadlessEditor } from '@orvilo/editor-runtime/headless';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { documentService } from '@/services/document';
import { useDocumentStore } from '@/store/document';

import { completeNativePageCreation, saveNativePageBeforeLeave } from './nativePageActions';

vi.unmock('zustand/traditional');
beforeEach(() => useDocumentStore.setState(useDocumentStore.getInitialState(), true));
afterEach(() => {
  vi.restoreAllMocks();
  useDocumentStore.setState(useDocumentStore.getInitialState(), true);
});

describe('native page save and creation outcomes', () => {
  it('saves actual kernel edits made while metadata is still flushing', async () => {
    const backend = createHeadlessEditor();
    backend.hydrateMarkdown('Initial');
    const documentId = 'native-save-race';
    useDocumentStore.setState({ activeDocumentId: documentId, editor: backend.kernel });
    useDocumentStore.getState().initDocumentWithEditor({
      documentId,
      editor: backend.kernel,
      content: 'Initial',
      editorData: backend.kernel.getDocument('json'),
      sourceType: 'page',
      autoSave: false,
    });
    const update = vi.spyOn(documentService, 'updateDocument').mockResolvedValue({
      id: documentId,
      historyAppended: false,
      savedAt: new Date().toISOString(),
    });
    let finishFlush: () => void = () => {
      throw new Error('Flush not started');
    };
    const flushing = new Promise<void>((resolve) => {
      finishFlush = resolve;
    });
    try {
      const saving = saveNativePageBeforeLeave({
        documentId,
        editor: backend.kernel,
        flushMetadata: () => flushing,
        getState: useDocumentStore.getState,
        failedMessage: 'Save failed',
      });
      backend.hydrateMarkdown('Actual edits during metadata request');
      expect(useDocumentStore.getState().documents[documentId]?.isDirty).toBe(false);
      finishFlush();
      await saving;
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          id: documentId,
          content: expect.stringContaining('Actual edits during metadata request'),
        }),
      );
      expect(useDocumentStore.getState().documents[documentId]?.isDirty).toBe(false);
    } finally {
      backend.destroy();
    }
  });

  it('refuses to save or report completion after another document takes ownership', async () => {
    const backend = createHeadlessEditor();
    const update = vi.spyOn(documentService, 'updateDocument');
    useDocumentStore.setState({ activeDocumentId: 'original', editor: backend.kernel });
    try {
      await expect(
        saveNativePageBeforeLeave({
          documentId: 'original',
          editor: backend.kernel,
          flushMetadata: async () => {
            useDocumentStore.setState({ activeDocumentId: 'other' });
          },
          getState: useDocumentStore.getState,
          failedMessage: 'Save failed',
        }),
      ).rejects.toThrow('no longer owns');
      expect(update).not.toHaveBeenCalled();
    } finally {
      backend.destroy();
    }
  });

  it('reuses the created page while persisting the latest title and emoji removal on retry', async () => {
    let retained: string | undefined;
    const persisted = { title: 'Original title', emoji: '😀' as string | null };
    const create = vi.fn(async () => ({ id: 'created-once' }));
    const retainId = (id: string) => {
      retained = id;
    };
    const update = vi
      .fn<(value: { title: string; metadata: { emoji: string | null } }) => Promise<void>>()
      .mockRejectedValueOnce(new Error('Metadata request failed'))
      .mockImplementationOnce(async (value) => {
        persisted.title = value.title;
        persisted.emoji = value.metadata.emoji;
      });
    await expect(
      completeNativePageCreation({
        title: 'Original title',
        emoji: '😀',
        create,
        retainId,
        update,
      }),
    ).rejects.toThrow('Metadata request failed');
    await expect(
      completeNativePageCreation({
        existingId: retained,
        title: 'Latest retry title',
        emoji: undefined,
        create,
        retainId,
        update,
      }),
    ).resolves.toBe('created-once');
    expect(create).toHaveBeenCalledTimes(1);
    expect(persisted).toEqual({ title: 'Latest retry title', emoji: null });
  });
});

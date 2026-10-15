import type {
  EditorRuntime,
  EditorRuntimeCommandBindings,
  EditorRuntimePort,
} from '@orvilo/editor-runtime';

import { hasMeaningfulEditorContent } from '@/libs/editor/hasMeaningfulEditorContent';
import { documentHistoryQueueService } from '@/services/documentHistoryQueue';
import { useDocumentStore } from '@/store/document';

import { bindActivePageRuntimeOwner } from '../activePageRuntimeOwner';

export type NativePageRuntimePort = Pick<
  EditorRuntime,
  | 'setEditor'
  | 'setCurrentDocId'
  | 'setTitleHandlers'
  | 'setBeforeMutateHandler'
  | 'setAfterMutateHandler'
>;

/** Share the production Runtime only through the active DocumentStore owner. */
export function bindNativePageRuntime({
  runtime,
  editor,
  commands,
  documentId,
  getTitle,
  setTitle,
}: {
  runtime: NativePageRuntimePort;
  editor: EditorRuntimePort;
  commands: EditorRuntimeCommandBindings;
  documentId: string;
  getTitle: () => string;
  setTitle: (title: string) => void;
}): () => void {
  const assertOwner = () => {
    const state = useDocumentStore.getState();
    if (state.editor !== editor || state.activeDocumentId !== documentId) {
      throw new Error('Native page no longer owns the active document');
    }
  };
  return bindActivePageRuntimeOwner({
    runtime,
    editor,
    documentId,
    source: useDocumentStore,
    bind: () => {
      runtime.setEditor(editor, commands);
      runtime.setCurrentDocId(documentId);
      runtime.setTitleHandlers((title) => {
        assertOwner();
        setTitle(title);
      }, getTitle);
      runtime.setBeforeMutateHandler(() => {
        assertOwner();
        if (!hasMeaningfulEditorContent(editor.getDocument('json'))) return;
        documentHistoryQueueService.enqueueEditorSnapshot({
          documentId,
          editor,
          lockOwnerId: useDocumentStore.getState().documents[documentId]?.lockOwnerId,
        });
      });
      runtime.setAfterMutateHandler(async () => {
        assertOwner();
        await useDocumentStore
          .getState()
          .commitEditorMutation(documentId, { saveSource: 'llm_call' });
      });
      return () => {
        runtime.setEditor(null);
        runtime.setCurrentDocId(undefined);
        runtime.setTitleHandlers(null, null);
        runtime.setBeforeMutateHandler(null);
        runtime.setAfterMutateHandler(null);
        void documentHistoryQueueService.flush();
      };
    },
  });
}

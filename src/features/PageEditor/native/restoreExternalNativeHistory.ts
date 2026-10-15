import type { DocumentStore } from '@/store/document';

import { getNativeHistoryOwner, type NativeHistoryOwner } from './nativeHistoryOwner';
import { restoreNativeHistory } from './restoreNativeHistory';

type RestoreState = Pick<
  DocumentStore,
  'activeDocumentId' | 'editor' | 'documents' | 'commitEditorMutation' | 'markDirty'
>;

/** External route headers have no PageChromeContext. Keep actual mounted owner,
 * lease and persistence checks across every await instead of caching a store
 * editor pointer at the moment the history menu was opened. */
export async function restoreExternalNativeHistory({
  owner,
  historyId,
  getState,
  load,
}: {
  owner: NativeHistoryOwner;
  historyId: string;
  getState: () => RestoreState;
  load: () => Promise<{ editorData: unknown }>;
}): Promise<void> {
  const assertOwner = () => {
    const state = getState();
    if (
      getNativeHistoryOwner(owner.documentId, state) !== owner ||
      !owner.canRestore() ||
      !state.documents[owner.documentId] ||
      state.documents[owner.documentId]?.saveBlockedByLock
    )
      throw new Error('History restore no longer owns an editable document');
  };
  await restoreNativeHistory({
    assertOwner,
    load,
    beforeRestore: async () => {
      await owner.beforeRestore();
      assertOwner();
      // Save the current real draft before replacing it with a historical
      // snapshot. Failure leaves the draft/editor intact for retry/recovery.
      await getState().commitEditorMutation(owner.documentId, { saveSource: 'manual' });
      assertOwner();
      if (getState().documents[owner.documentId]?.isDirty)
        throw new Error('The current draft could not be saved before history restore');
    },
    apply: (editorData) => owner.editor.setDocument('json', JSON.stringify(editorData)),
    save: async () => {
      getState().markDirty(owner.documentId);
      await getState().commitEditorMutation(owner.documentId, {
        restoreFromHistoryId: historyId,
        saveSource: 'restore',
      });
      assertOwner();
      if (getState().documents[owner.documentId]?.isDirty)
        throw new Error('The restored history snapshot did not persist');
    },
  });
}

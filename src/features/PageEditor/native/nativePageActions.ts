import type { DocumentStore } from '@/store/document';
import type { DocumentEditorPort } from '@/store/document/types';

export async function saveNativePageBeforeLeave({
  documentId,
  editor,
  flushMetadata,
  getState,
  failedMessage,
}: {
  documentId: string;
  editor: DocumentEditorPort;
  flushMetadata: () => Promise<void>;
  getState: () => Pick<
    DocumentStore,
    'activeDocumentId' | 'editor' | 'documents' | 'commitEditorMutation'
  >;
  failedMessage: string;
}) {
  const owned = () => {
    const state = getState();
    if (state.activeDocumentId !== documentId || state.editor !== editor)
      throw new Error('Native page no longer owns the active document');
    return state;
  };
  owned();
  await flushMetadata();
  await owned().commitEditorMutation(documentId, { saveSource: 'manual' });
  const document = owned().documents[documentId];
  if (!document || document.isDirty) throw new Error(failedMessage);
}

export async function completeNativePageCreation({
  existingId,
  title,
  emoji,
  create,
  retainId,
  update,
}: {
  existingId?: string;
  title: string;
  emoji?: string;
  create: () => Promise<{ id: string }>;
  retainId: (id: string) => void;
  update: (value: {
    id: string;
    title: string;
    metadata: { emoji: string | null };
    saveSource: 'autosave';
  }) => Promise<unknown>;
}) {
  const id = existingId ?? (await create()).id;
  retainId(id);
  if (existingId || emoji !== undefined)
    await update({ id, title, metadata: { emoji: emoji ?? null }, saveSource: 'autosave' });
  return id;
}

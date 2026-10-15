import type { NativeIEditorKernel, NativeIPlugin } from '@orvilo/editor-runtime/native-browser';

import type { NativeEditorWidgets } from '@/components/NativePageEditor/session';
import type { DocumentEditorPort } from '@/store/document/types';

export interface NativeHistoryOwner {
  beforeRestore: () => Promise<void>;
  canRestore: () => boolean;
  documentId: string;
  editor: NativeIEditorKernel;
  getRichDiff: () => { widgets: NativeEditorWidgets; plugins?: NativeIPlugin[] };
}
interface ActiveDocumentOwner {
  activeDocumentId?: string;
  editor?: DocumentEditorPort;
}
const owners = new Map<
  string,
  Map<DocumentEditorPort, { owner: NativeHistoryOwner; token: object }>
>();

/** Scoped to a mounted native document; registration itself never establishes
 * active ownership. A late cleanup cannot delete a newer lifetime's entry. */
export function registerNativeHistoryOwner(owner: NativeHistoryOwner): () => void {
  const token = {};
  const documentOwners =
    owners.get(owner.documentId) ??
    new Map<DocumentEditorPort, { owner: NativeHistoryOwner; token: object }>();
  documentOwners.set(owner.editor, { owner, token });
  owners.set(owner.documentId, documentOwners);
  return () => {
    if (documentOwners.get(owner.editor)?.token !== token) return;
    documentOwners.delete(owner.editor);
    if (!documentOwners.size && owners.get(owner.documentId) === documentOwners)
      owners.delete(owner.documentId);
  };
}
export function getNativeHistoryOwner(
  documentId: string,
  active: ActiveDocumentOwner,
): NativeHistoryOwner | undefined {
  if (active.activeDocumentId !== documentId || !active.editor) return undefined;
  return owners.get(documentId)?.get(active.editor)?.owner;
}

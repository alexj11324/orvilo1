'use client';

import type { NativeEditorWidgets } from '@/components/NativePageEditor/session';

import DocumentCommentsBody from './DocumentCommentsBody';
import { NativeDocumentCommentEditorProvider } from './nativeEditorKit';

/** Full original threads/CRUD/drafts/deep-link workflow, with explicit native
 * rich editor ownership. The legacy index keeps its original SDK kit. */
export function NativeDocumentComments({
  documentId,
  widgets,
}: {
  documentId: string;
  widgets: NativeEditorWidgets;
}) {
  return (
    <NativeDocumentCommentEditorProvider widgets={widgets}>
      <DocumentCommentsBody documentId={documentId} key={documentId} />
    </NativeDocumentCommentEditorProvider>
  );
}

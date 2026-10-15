'use client';
import DocumentCommentsBody from './DocumentCommentsBody';
import { LegacyDocumentCommentEditorProvider } from './legacyEditorKit';

export default function DocumentComments({ documentId }: { documentId: string }) {
  return (
    <LegacyDocumentCommentEditorProvider>
      <DocumentCommentsBody documentId={documentId} />
    </LegacyDocumentCommentEditorProvider>
  );
}

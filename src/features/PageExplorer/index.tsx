'use client';

import { memo, type ReactNode } from 'react';

import { PageEditor } from '@/features/PageEditor';
import {
  usePageDocumentMetadata,
  usePageDocumentMetadataActions,
} from '@/features/PageEditor/usePageDocumentMetadata';

interface PageExplorerProps {
  /** Forwarded to PageEditor. */
  fullWidthHeader?: boolean;
  /**
   * Custom header slot. `null` hides the editor header entirely; any node
   * replaces the built-in `<Header />`. Forwarded to PageEditor.
   */
  header?: ReactNode | null;
  pageId: string;
}

/**
 * Document editor surface shared by Agent Documents and Resource Manager.
 */
const PageExplorer = memo<PageExplorerProps>(({ pageId, header, fullWidthHeader }) => {
  // Get document title and emoji from PageStore
  const document = usePageDocumentMetadata(pageId);
  const title = document?.title ?? undefined;
  const emoji = document?.metadata?.emoji as string | undefined;
  const { updateEmoji, updateTitle } = usePageDocumentMetadataActions(pageId);

  return (
    <PageEditor
      emoji={emoji}
      fullWidthHeader={fullWidthHeader}
      header={header}
      key={pageId}
      pageId={pageId}
      title={title}
      onEmojiChange={updateEmoji}
      onTitleChange={updateTitle}
    />
  );
});

export default PageExplorer;

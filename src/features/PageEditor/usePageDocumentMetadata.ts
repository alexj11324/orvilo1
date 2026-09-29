'use client';

import type { DocumentItem } from '@orvilo/database/schemas';
import { useCallback } from 'react';

import { mutate, useClientDataSWR } from '@/libs/swr';
import { documentSWRKeys } from '@/services/document/swrKeys';
import { pageSelectors, usePageStore } from '@/store/page';

/**
 * The Pages list is paginated and excludes team-owned documents. Keep metadata
 * for an open document from its editor request so a list refresh cannot erase
 * the title or change the editor's lock scope.
 */
export const usePageDocumentMetadata = (documentId: string | undefined) => {
  const listDocument = usePageStore(pageSelectors.getDocumentById(documentId));
  const { data: openDocument } = useClientDataSWR<DocumentItem | null>(
    documentId ? documentSWRKeys.editor(documentId) : null,
    null,
    { revalidateOnFocus: false, revalidateOnReconnect: false },
  );

  if (openDocument === null) return undefined;
  return listDocument ?? (openDocument?.id === documentId ? openDocument : undefined);
};

/** Keep an open team Page's editor cache current after it leaves the global Pages list. */
export const usePageDocumentMetadataActions = (documentId: string) => {
  const updatePageOptimistically = usePageStore((s) => s.updatePageOptimistically);

  const updateTitle = useCallback(
    (title: string) => {
      void mutate(
        documentSWRKeys.editor(documentId),
        (current) => (current ? { ...current, title } : current),
        { revalidate: false },
      );
      if (usePageStore.getState().documents?.some((document) => document.id === documentId)) {
        void updatePageOptimistically(documentId, { title });
      }
    },
    [documentId, updatePageOptimistically],
  );

  const updateEmoji = useCallback(
    (emoji: string | undefined) => {
      void mutate(
        documentSWRKeys.editor(documentId),
        (current) => {
          if (!current) return current;
          const metadata = { ...current.metadata };
          if (emoji === undefined) delete metadata.emoji;
          else metadata.emoji = emoji;
          return { ...current, metadata };
        },
        { revalidate: false },
      );
      if (usePageStore.getState().documents?.some((document) => document.id === documentId)) {
        void updatePageOptimistically(documentId, { emoji });
      }
    },
    [documentId, updatePageOptimistically],
  );

  return { updateEmoji, updateTitle };
};

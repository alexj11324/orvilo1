'use client';

import type { DocumentItem } from '@orvilo/database/schemas';
import { useEffect, useState } from 'react';

import { useClientDataSWR } from '@/libs/swr';
import { documentService } from '@/services/document';
import { documentSWRKeys } from '@/services/document/swrKeys';
import { useDocumentStore } from '@/store/document';
import { editorSelectors } from '@/store/document/slices/editor';
import type { DocumentEditorPort } from '@/store/document/types';
import { usePageStore } from '@/store/page';
import { isSkillMarkdownDocument } from '@/utils/skillMarkdown';

/** Native resource ingress checks ownership and unsaved edits at response time,
 * including a request begun while clean but completed after the user typed. */
export function useNativeDocumentResource(
  documentId: string,
  editor: DocumentEditorPort | undefined,
  autoSave: boolean,
) {
  const [hydrationDocument, setHydrationDocument] = useState<DocumentItem>();
  const isDirty = useDocumentStore(editorSelectors.isDirty(documentId));
  const response = useClientDataSWR<DocumentItem | null>(
    editor ? documentSWRKeys.editor(documentId) : null,
    async () => (await documentService.getDocumentById(documentId)) ?? null,
    { focusThrottleInterval: 20_000, revalidateOnFocus: true },
  );
  const { data } = response;
  useEffect(() => {
    if (!editor || !data || data.id !== documentId) return;
    const state = useDocumentStore.getState();
    if (state.activeDocumentId !== documentId || state.editor !== editor) return;
    const current = state.documents[documentId];
    if (current?.isDirty) {
      // A resident dirty document can hydrate its existing store snapshot into
      // this new editor, while the remote response must not reset its baseline.
      setHydrationDocument((accepted) => accepted ?? data);
      return;
    }
    // A response already in flight before our successful save is not newer
    // persisted content and must not replace that save's editor state.
    if (current?.lastUpdatedTime && data.updatedAt && data.updatedAt < current.lastUpdatedTime)
      return;
    state.initDocumentWithEditor({
      documentId,
      editor,
      autoSave,
      sourceType: 'page',
      content: data.content,
      contentFormat: isSkillMarkdownDocument(data) ? 'skillMarkdown' : 'markdown',
      editorData: data.editorData,
    });
    usePageStore.getState().upsertDocument(data);
    setHydrationDocument(data);
  }, [autoSave, data, documentId, editor, isDirty]);
  return { ...response, hydrationDocument };
}

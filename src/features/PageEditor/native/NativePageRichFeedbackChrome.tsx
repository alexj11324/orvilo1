'use client';

import type { NativeEditorWidgets } from '@/components/NativePageEditor/session';

import { NativeDocumentComments } from '../DocumentComments/NativeDocumentComments';
import DocumentLikes from '../DocumentLikes';
import type { NativePageChrome } from './NativePageEditorAssembler';

/** Explicit richer replacement for feedback v1. Widget owners are mandatory;
 * there is no legacy comment editor fallback when native is selected. */
export function withNativeRichFeedback(
  chrome: Omit<NativePageChrome, 'likes' | 'comments'>,
  widgets: NativeEditorWidgets,
): NativePageChrome {
  return {
    ...chrome,
    likes: ({ documentId }) => <DocumentLikes documentId={documentId} key={documentId} />,
    comments: ({ documentId }) => (
      <NativeDocumentComments documentId={documentId} key={documentId} widgets={widgets} />
    ),
  };
}

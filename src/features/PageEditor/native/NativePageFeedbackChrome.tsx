'use client';

import DocumentComments from '../DocumentComments';
import DocumentLikes from '../DocumentLikes';
import type { NativePageChrome } from './NativePageEditorAssembler';

/** Feedback permissions differ from document mutation: reading/liking and the
 * comment's create/edit/delete rules must not be gated by the page edit lease.
 * These independent owners retain their actual workspace services and rules. */
export const nativePageFeedbackChrome = {
  comments: ({ documentId }) => <DocumentComments documentId={documentId} key={documentId} />,
  likes: ({ documentId }) => <DocumentLikes documentId={documentId} key={documentId} />,
} satisfies Pick<NativePageChrome, 'comments' | 'likes'>;

/** Compose concrete feedback with the other required native chrome owners.
 * No default/fake empty slot and no SDK PageEditorProvider are introduced. */
export function withNativePageFeedback(
  chrome: Omit<NativePageChrome, 'comments' | 'likes'>,
): NativePageChrome {
  return { ...chrome, ...nativePageFeedbackChrome };
}

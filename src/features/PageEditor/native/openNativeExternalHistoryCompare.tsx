'use client';

import type { ModalInstance } from '@/components/Modal';

import type { CompareContentProps } from '../History/CompareModal/CompareContent';
import { createDocumentCompareModal } from '../History/CompareModal/createDocumentCompareModal';
import { NativeDocumentHistoryDiff } from './NativeDocumentHistoryDiff';
import type { NativeHistoryOwner } from './nativeHistoryOwner';

/** The invoking route supplies its actual native document owner and rich
 * renderers. The pure modal retains sidebar/author/date/restore behavior. */
export function openNativeExternalHistoryCompare(
  props: Omit<CompareContentProps, 'renderDiff'>,
  owner: NativeHistoryOwner,
): ModalInstance {
  return createDocumentCompareModal({
    ...props,
    canRestore: owner.canRestore(),
    renderDiff: (ids) => <NativeDocumentHistoryDiff {...owner.getRichDiff()} {...ids} />,
  });
}

'use client';

import type { ModalInstance } from '@/components/Modal';

import DocumentHistoryDiff from '../DocumentHistoryDiff';
import type { CompareContentProps } from './CompareContent';
import { createDocumentCompareModal } from './createDocumentCompareModal';

/** Existing legacy entry keeps its original renderer and public props. Native
 * callers import the pure factory directly, with no SDK renderer dependency. */
export type OpenDocumentCompareModalProps = Omit<CompareContentProps, 'renderDiff'>;
export const openDocumentCompareModal = (props: OpenDocumentCompareModalProps): ModalInstance =>
  createDocumentCompareModal({
    ...props,
    renderDiff: (ids) => <DocumentHistoryDiff {...ids} />,
  });

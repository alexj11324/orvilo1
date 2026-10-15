'use client';

import { t } from 'i18next';

import type { ModalInstance } from '@/components/Modal';
import { createModal } from '@/components/Modal';

import CompareContent, { type CompareContentProps } from './CompareContent';

export type { CompareContentProps, DocumentHistoryDiffRenderer } from './CompareContent';

export const createDocumentCompareModal = (props: CompareContentProps): ModalInstance =>
  createModal({
    content: <CompareContent {...props} />,
    footer: null,
    styles: {
      content: {
        display: 'flex',
        height: 'min(72vh, 800px)',
        overflow: 'hidden',
        padding: 0,
      },
    },
    title: t('pageEditor.history.compareTitle', { ns: 'file' }),
    width: 'min(92vw, 1200px)',
  });

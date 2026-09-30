'use client';

import type { ModalInstance } from '@/components/Modal';
import { createModal } from '@/components/Modal';

import CreateGoalContent, { type CreateGoalContentProps } from './CreateGoalContent';

export type { CreateGoalContentProps };

export const createGoalModal = (props?: CreateGoalContentProps): ModalInstance =>
  createModal({
    content: <CreateGoalContent {...props} />,
    footer: null,
    maskClosable: false,
    styles: {
      content: {
        overflow: 'hidden',
        padding: 0,
      },
    },
    title: null,
    width: 'min(88vw, 720px)',
  });

'use client';

import { createModal, type ModalInstance } from '@/components/Modal';

import CreateTaskContent, { type CreateTaskContentProps } from './CreateTaskContent';

export const createTaskModal = (props?: CreateTaskContentProps): ModalInstance =>
  createModal({
    content: <CreateTaskContent {...props} />,
    footer: null,
    maskClosable: true,
    styles: {
      content: {
        overflow: 'hidden',
        padding: 0,
      },
    },
    title: null,
    width: 'min(80%, 680px)',
  });

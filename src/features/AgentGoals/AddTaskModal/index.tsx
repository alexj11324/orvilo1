'use client';

import { t } from 'i18next';

import type { ModalInstance } from '@/components/Modal';
import { createModal } from '@/components/Modal';

import AddTaskContent, { type AddTaskContentProps } from './AddTaskContent';

export type { AddTaskContentProps };

export const openAddGoalTaskModal = (props: AddTaskContentProps): ModalInstance =>
  createModal({
    content: <AddTaskContent {...props} />,
    footer: null,
    maskClosable: true,
    title: t('goalProcess.frontier.add', { ns: 'chat' }),
    width: 'min(90%, 560px)',
  });

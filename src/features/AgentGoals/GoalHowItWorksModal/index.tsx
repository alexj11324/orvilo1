'use client';

import { t } from 'i18next';

import type { ModalInstance } from '@/components/Modal';
import { createModal } from '@/components/Modal';

import HowItWorksContent from './HowItWorksContent';

export const createGoalHowItWorksModal = (): ModalInstance =>
  createModal({
    content: <HowItWorksContent />,
    footer: null,
    maskClosable: true,
    title: t('goalEmpty.howTitle', { ns: 'chat' }),
    width: 'min(88vw, 520px)',
  });

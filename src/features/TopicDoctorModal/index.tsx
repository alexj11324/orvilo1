'use client';

import { t } from 'i18next';

import { createModal, type ModalInstance } from '@/components/Modal';

import TopicDoctorContent, { type TopicDoctorContentProps } from './Content';

export const openTopicDoctorModal = (props: TopicDoctorContentProps): ModalInstance =>
  createModal({
    content: <TopicDoctorContent {...props} />,
    footer: null,
    maskClosable: true,
    title: t('doctor.title', { ns: 'topic' }),
    width: 'min(90vw, 480px)',
  });

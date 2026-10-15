'use client';

import { t } from 'i18next';

import { createModal, type ModalInstance } from '@/components/Modal';

import type { ModelConfigFormHandle } from '../CreateNewModelModal/Form';
import ModelConfigContent from './Content';
import ModelConfigFooter from './Footer';

interface ModelConfigModalOptions {
  id: string;
  showDeployName?: boolean;
}

export const createModelConfigModal = (options: ModelConfigModalOptions): ModalInstance => {
  const formRef: { current?: ModelConfigFormHandle } = {};

  return createModal({
    content: (
      <ModelConfigContent
        id={options.id}
        showDeployName={options.showDeployName}
        onFormReady={(instance) => {
          formRef.current = instance;
        }}
      />
    ),
    footer: <ModelConfigFooter formRef={formRef} id={options.id} />,
    maskClosable: false,
    title: t('llm.customModelCards.modelConfig.modalTitle', { ns: 'setting' }),
    width: 'min(90vw, 640px)',
  });
};

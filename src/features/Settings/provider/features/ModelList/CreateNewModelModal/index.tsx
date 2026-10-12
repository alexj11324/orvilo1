'use client';

import { t } from 'i18next';

import { createModal, type ModalInstance } from '@/components/Modal';

import CreateNewModelContent from './Content';
import CreateNewModelFooter from './Footer';
import type { ModelConfigFormHandle } from './Form';

interface CreateNewModelModalOptions {
  existingModelIds?: string[];
  showDeployName?: boolean;
}

export const createCreateNewModelModal = (
  options: CreateNewModelModalOptions = {},
): ModalInstance => {
  const formRef: { current?: ModelConfigFormHandle } = {};

  return createModal({
    content: (
      <CreateNewModelContent
        existingModelIds={options.existingModelIds}
        showDeployName={options.showDeployName}
        onFormReady={(instance) => {
          formRef.current = instance;
        }}
      />
    ),
    footer: <CreateNewModelFooter formRef={formRef} />,
    maskClosable: false,
    title: t('providerModels.createNew.title', { ns: 'modelProvider' }),
    width: 'min(90vw, 640px)',
  });
};

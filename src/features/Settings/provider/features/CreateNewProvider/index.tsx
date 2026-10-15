'use client';

import { createModal, type ModalInstance } from '@lobehub/ui/base-ui';
import { t } from 'i18next';
import { BrainIcon } from 'lucide-react';

import CreateNewProviderContent from './Content';

export const createCreateNewProviderModal = (): ModalInstance =>
  createModal({
    content: <CreateNewProviderContent />,
    footer: null,
    maskClosable: false,
    styles: {
      content: { paddingBlock: 16, paddingInline: 24 },
    },
    title: (
      <div className="flex items-center gap-2">
        <BrainIcon size="1em" />
        {t('createNewAiProvider.title', { ns: 'modelProvider' })}
      </div>
    ),
    width: 'min(90vw, 640px)',
  });

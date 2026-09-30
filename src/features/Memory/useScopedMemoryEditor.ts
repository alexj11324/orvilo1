import { toast } from '@lobehub/ui/base-ui';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { openEditorModal, type OpenEditorModalOptions } from '@/features/EditorModal';
import { getMemorySession, useMemorySession } from '@/store/userMemory/utils/session';

export const useScopedMemoryEditor = () => {
  const session = useMemorySession();
  const { t } = useTranslation('memory');
  const instance = useRef<ReturnType<typeof openEditorModal>>(undefined);
  useEffect(
    () => () => {
      instance.current?.close();
    },
    [session],
  );
  return (options: OpenEditorModalOptions) => {
    const session = getMemorySession();
    instance.current?.close();
    instance.current = openEditorModal({
      ...options,
      onConfirm: async (...args) => {
        if (session !== getMemorySession()) return;
        try {
          await options.onConfirm?.(...args);
        } catch (error) {
          if (session === getMemorySession()) toast.error(t('manager.failed'));
          throw error;
        }
      },
    });
  };
};

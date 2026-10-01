'use client';

import { type ReactNode } from 'react';

import type { ImperativeModalProps, ModalInstance } from '@/components/Modal';
import { createModal } from '@/components/Modal';

let formIdSeed = 0;

interface CreateFormModalOptions extends Omit<ImperativeModalProps, 'content' | 'footer'> {
  renderContent: (api: { formId: string; setLoading: (loading: boolean) => void }) => ReactNode;
  renderFooter: (api: { formId: string; loading: boolean }) => ReactNode;
}

export const createFormModal = ({
  renderContent,
  renderFooter,
  ...rest
}: CreateFormModalOptions): ModalInstance => {
  const formId = `form-modal-${formIdSeed++}`;
  const ref: { instance?: ModalInstance } = {};
  const setLoading = (loading: boolean) => {
    ref.instance?.update({
      footer: renderFooter({ formId, loading }),
    } as Partial<ImperativeModalProps>);
  };
  ref.instance = createModal({
    ...rest,
    content: renderContent({ formId, setLoading }),
    footer: renderFooter({ formId, loading: false }),
  });
  return ref.instance;
};

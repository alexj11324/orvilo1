'use client';

import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ModalFooter, useModalContext } from '@/components/Modal';
import { Button } from '@/components/ui/button';
import { useAiInfraStore } from '@/store/aiInfra';

import type { ModelConfigFormHandle } from './Form';

interface CreateNewModelFooterProps {
  formRef: { current?: ModelConfigFormHandle };
}

const CreateNewModelFooter = ({ formRef }: CreateNewModelFooterProps) => {
  const { t } = useTranslation('common');
  const { close } = useModalContext();
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const submitting = useRef(false);
  const [editingProvider, createNewAiModel] = useAiInfraStore((s) => [
    s.activeAiProvider!,
    s.createNewAiModel,
  ]);

  const submit = async () => {
    const form = formRef.current;
    if (submitting.current || !editingProvider || !form) return;
    submitting.current = true;
    setLoading(true);
    setFailed(false);
    try {
      const data = await form.validateFields();
      if (!data) return;
      await createNewAiModel({ ...data, providerId: editingProvider });
      close();
    } catch {
      // Retain the form draft and keep the action available for another attempt.
      setFailed(true);
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  };

  return (
    <ModalFooter>
      <div className="flex w-full flex-col gap-2">
        {failed && (
          <p className="text-sm text-destructive-text" role="alert">
            {t('operationFailed')}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button
            className="pointer-coarse:min-h-11"
            size="normal"
            type="button"
            variant="outline"
            onClick={close}
          >
            {t('cancel')}
          </Button>
          <Button
            className="pointer-coarse:min-h-11"
            loading={loading}
            size="normal"
            type="button"
            onClick={submit}
          >
            {t('ok')}
          </Button>
        </div>
      </div>
    </ModalFooter>
  );
};

export default CreateNewModelFooter;

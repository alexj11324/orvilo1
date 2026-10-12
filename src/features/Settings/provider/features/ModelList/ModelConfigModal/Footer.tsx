'use client';

import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ModalFooter, useModalContext } from '@/components/Modal';
import { Button } from '@/components/ui/button';
import { useAiInfraStore } from '@/store/aiInfra';

import type { ModelConfigFormHandle } from '../CreateNewModelModal/Form';

interface ModelConfigFooterProps {
  formRef: { current?: ModelConfigFormHandle };
  id: string;
}

const ModelConfigFooter = ({ formRef, id }: ModelConfigFooterProps) => {
  const { t } = useTranslation('common');
  const { close } = useModalContext();
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const submitting = useRef(false);
  const [editingProvider, updateAiModelsConfig] = useAiInfraStore((s) => [
    s.activeAiProvider!,
    s.updateAiModelsConfig,
  ]);

  const submit = async () => {
    const form = formRef.current;
    if (submitting.current || !editingProvider || !id || !form) return;
    const data = form.getFieldsValue();
    submitting.current = true;
    setLoading(true);
    setFailed(false);
    try {
      // Preserve editing's existing mounted-field payload and store mutation.
      await updateAiModelsConfig(id, editingProvider, data);
      close();
    } catch {
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

export default ModelConfigFooter;

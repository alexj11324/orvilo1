'use client';

import type { OrviloAgentConfig } from '@orvilo/types';
import { t as i18nT } from 'i18next';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncError from '@/components/AsyncError';
import { createModal, useModalContext } from '@/components/Modal';
import { Button } from '@/components/ui/button';

import { RuntimeFields, type RuntimeRequest, useAgentRuntimeForm } from './RuntimeFields';

export type { AgentModelPickerProps } from './AgentModelPicker';
export { AgentModelPicker } from './AgentModelPicker';
export type { RuntimeRequest } from './RuntimeFields';
export type AgentRuntimeConfig = Pick<OrviloAgentConfig, 'agencyConfig'> & {
  model?: string | null;
  provider?: string | null;
  title?: string | null;
};

const RuntimeChooser = ({
  onSelected,
  ...request
}: RuntimeRequest & { onSelected: (config: AgentRuntimeConfig) => void }) => {
  const { t } = useTranslation(['chat', 'common']);
  const { close } = useModalContext();
  const form = useAgentRuntimeForm(request);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>();
  const saving = useRef(false);
  const submit = async () => {
    if (saving.current || !form.ready) return;
    saving.current = true;
    setPending(true);
    setError(undefined);
    try {
      const config = await form.prepare();
      form.setApiKey('');
      onSelected(config);
      close();
    } catch (cause) {
      setError(cause);
    } finally {
      saving.current = false;
      setPending(false);
    }
  };
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <RuntimeFields disabled={pending} form={form} />
      {error !== undefined && (
        <AsyncError error={error} variant="inline" onRetry={() => void submit()} />
      )}
      <div className="flex justify-end gap-2">
        <Button disabled={pending} type="button" variant="outline" onClick={close}>
          {t('common:cancel')}
        </Button>
        <Button disabled={pending || !form.ready} loading={pending} type="submit">
          {t('creation.runtime.use')}
        </Button>
      </div>
    </form>
  );
};

/** Template and coordinator callers configure execution without creating an Agent row. */
export const requestAgentRuntime = (
  options: RuntimeRequest = {},
): Promise<AgentRuntimeConfig | undefined> =>
  new Promise((resolve) => {
    createModal({
      content: <RuntimeChooser {...options} onSelected={resolve} />,
      footer: null,
      maskClosable: false,
      onOpenChangeComplete: (open) => {
        if (!open) resolve(undefined);
      },
      title: i18nT('creation.runtime.title', { ns: 'chat' }),
      width: 'min(92vw, 520px)',
    });
  });

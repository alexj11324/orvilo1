import type { AutomationResultWebhookConfig } from '@orvilo/types';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncBoundary from '@/components/AsyncBoundary';
import AsyncError from '@/components/AsyncError';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { automationResultDeliveryService } from '@/services/automationResultDelivery';
import { useAutomationResultsStore } from '@/store/automationResults';

interface Props {
  onSaved?: () => void | Promise<void>;
  readOnly?: boolean;
  taskId: string;
  value: AutomationResultWebhookConfig[];
}

function OutputForm({ taskId, value, onSaved, readOnly = false }: Props) {
  const { t } = useTranslation('automation');
  const [url, setUrl] = useState(value[0]?.url ?? '');
  const [credentialId, setCredentialId] = useState(value[0]?.credentialId ?? 'none');
  const [pending, setPending] = useState(false);
  const [saveError, setSaveError] = useState<unknown>();
  const useFetchCredentials = useAutomationResultsStore((s) => s.useFetchOutputCredentials);
  const credentials = useFetchCredentials(taskId);

  const save = async () => {
    if (readOnly) return;
    setPending(true);
    setSaveError(undefined);
    try {
      if (url.trim()) {
        const endpoint = new URL(url.trim());
        if (
          endpoint.protocol !== 'https:' ||
          endpoint.username ||
          endpoint.password ||
          endpoint.search ||
          endpoint.hash
        )
          throw new Error(t('result.invalidEndpoint'));
      }
      await automationResultDeliveryService.update(
        taskId,
        url.trim()
          ? [
              {
                credentialId: credentialId === 'none' ? undefined : credentialId,
                id: value[0]?.id ?? 'result-webhook',
                url: url.trim(),
              },
            ]
          : [],
      );
      await onSaved?.();
    } catch (error) {
      setSaveError(error);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold">{t('result.settingsTitle')}</h3>
      <p className="text-sm text-muted-foreground">{t('result.inboxNotice')}</p>
      <label className="flex flex-col gap-1 text-sm">
        {t('result.endpoint')}
        <Input
          disabled={pending || readOnly}
          placeholder="https://example.com/results"
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
        />
      </label>
      <p className="text-xs text-muted-foreground">{t('result.endpointHint')}</p>
      <AsyncBoundary
        data={credentials.data}
        error={credentials.error}
        isLoading={credentials.isLoading}
        onRetry={() => void credentials.mutate()}
      >
        <div className="flex flex-col gap-1 text-sm">
          <span>{t('result.credential')}</span>
          <Select
            disabled={pending || readOnly}
            value={credentialId}
            onValueChange={(value) => setCredentialId(value ?? 'none')}
          >
            <SelectTrigger aria-label={t('result.credential')} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t('result.noCredential')}</SelectItem>
              {credentials.data
                ?.filter((credential) => credential.type === 'kv-header')
                .map((credential) => (
                  <SelectItem key={credential.id} value={credential.id}>
                    {credential.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{t('result.credentialHint')}</p>
        </div>
      </AsyncBoundary>
      {saveError ? <AsyncError error={saveError} variant="inline" /> : null}
      <div>
        <Button disabled={readOnly} loading={pending} onClick={() => void save()}>
          {t('result.save')}
        </Button>
      </div>
    </div>
  );
}

export default function ResultWebhookSettings(props: Props) {
  return <OutputForm key={JSON.stringify([props.taskId, props.value])} {...props} />;
}

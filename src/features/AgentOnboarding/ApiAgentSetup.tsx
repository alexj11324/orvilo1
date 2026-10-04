import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncError from '@/components/AsyncError';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  createOnboardingAgentOnce,
  type FirstAgentCreationCheckpoint,
  type FirstAgentProviderCheckpoint,
  firstPrimeAgentConfig,
  prepareFirstAgentProvider,
  verifyFirstAgentDevice,
} from '@/services/agentOnboarding';
import { useAgentStore } from '@/store/agent';

export default function ApiAgentSetup({
  onCreated,
  deviceId,
}: {
  deviceId?: string;
  onCreated: (agentId: string, deviceId: string) => Promise<void>;
}) {
  const { t } = useTranslation('chat');
  const [apiKey, setApiKey] = useState('');
  const [endpoint, setEndpoint] = useState('https://api.openai.com/v1');
  const [model, setModel] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>();
  const checkpoint = useRef<FirstAgentProviderCheckpoint>({});
  const createdAgent = useRef<{ agentId: string; deviceId: string } | undefined>(undefined);
  const creation = useRef<FirstAgentCreationCheckpoint>({ requestId: crypto.randomUUID() });
  const saving = useRef(false);
  const createAgent = useAgentStore((s) => s.createAgent);

  const submit = async () => {
    if (saving.current) return;
    saving.current = true;
    setPending(true);
    setError(undefined);
    try {
      if (!createdAgent.current) {
        if (!deviceId) throw new Error('FIRST_AGENT_DEVICE_REQUIRED');
        await verifyFirstAgentDevice(deviceId);
        const binding = await prepareFirstAgentProvider(
          { apiKey, endpoint, model },
          checkpoint.current,
        );
        const created = await createOnboardingAgentOnce(
          creation.current,
          {
            config: firstPrimeAgentConfig(binding.model, deviceId),
            visibility: 'private',
          },
          createAgent,
        );
        const savedDeviceId = created.config?.agencyConfig?.boundDeviceId;
        if (!savedDeviceId) throw new Error('FIRST_AGENT_DEVICE_REQUIRED');
        createdAgent.current = { agentId: created.agentId, deviceId: savedDeviceId };
      }
      setApiKey('');
      await onCreated(createdAgent.current!.agentId, createdAgent.current!.deviceId);
    } catch (cause) {
      setError(cause);
    } finally {
      saving.current = false;
      setPending(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <p className="text-sm text-muted-foreground">{t('onboarding.api.description')}</p>
      <label className="flex flex-col gap-1 text-sm">
        {t('onboarding.api.endpoint')}
        <Input
          required
          disabled={pending || !!createdAgent.current || creation.current.attempted}
          type="url"
          value={endpoint}
          onChange={(event) => setEndpoint(event.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t('onboarding.api.model')}
        <Input
          required
          disabled={pending || !!createdAgent.current || creation.current.attempted}
          value={model}
          onChange={(event) => setModel(event.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t('onboarding.api.key')}
        <Input
          autoComplete="new-password"
          disabled={pending || !!createdAgent.current}
          required={!createdAgent.current}
          type="password"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
        />
      </label>
      {error !== undefined && (
        <AsyncError
          description={t('onboarding.api.failed')}
          error={error}
          retrying={pending}
          onRetry={() => void submit()}
        />
      )}
      <Button disabled={pending || !deviceId} loading={pending} type="submit">
        {t('onboarding.api.create')}
      </Button>
    </form>
  );
}

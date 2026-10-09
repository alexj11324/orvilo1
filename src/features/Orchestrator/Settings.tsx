'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import AsyncError from '@/components/AsyncError';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';

import ConfiguredOrchestratorSelector from './ConfiguredOrchestratorSelector';
import { useOrchestratorPreference } from './useOrchestratorPreference';

const SettingsContent = () => {
  const { t } = useTranslation('setting');
  const preference = useOrchestratorPreference();
  const [selection, setSelection] = useState<string>();
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>();
  const save = async () => {
    if (!selection || !ready || pending) return;
    setPending(true);
    setError(undefined);
    try {
      await preference.save(selection);
      toast.success(t('orchestrator.saved'));
    } catch (cause) {
      setError(cause);
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="flex flex-col gap-5" key={preference.workspaceId ?? 'personal'}>
      <p className="text-sm text-muted-foreground">{t('orchestrator.description')}</p>
      <p className="text-sm">
        {t(preference.workspaceId ? 'orchestrator.workspaceScope' : 'orchestrator.personalScope')}
      </p>
      <ConfiguredOrchestratorSelector
        disabled={pending || preference.loading}
        value={selection ?? preference.agentId}
        visibility={preference.workspaceId ? 'public' : 'private'}
        workspaceId={preference.workspaceId}
        onUnavailable={() => setReady(false)}
        onSelect={(id) => {
          setSelection(id);
          setReady(true);
        }}
      />
      {(error || preference.error) && (
        <AsyncError
          error={error ?? preference.error}
          onRetry={() => void (error ? save() : preference.retry())}
        />
      )}
      <Button
        className="self-end"
        disabled={!selection || !ready || pending}
        loading={pending}
        onClick={() => void save()}
      >
        {t('save', { ns: 'common' })}
      </Button>
    </div>
  );
};
const Settings = () => {
  const workspaceId = useActiveWorkspaceId();
  return <SettingsContent key={workspaceId ?? 'personal'} />;
};
export default Settings;

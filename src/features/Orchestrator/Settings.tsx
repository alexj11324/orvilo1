'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { useWorkspaceCapabilities } from '@/business/client/hooks/useWorkspaceCapabilities';
import AsyncError from '@/components/AsyncError';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';

import ConfiguredOrchestratorSelector from './ConfiguredOrchestratorSelector';
import { useOrchestratorPreference } from './useOrchestratorPreference';

const SettingsContent = () => {
  const { t } = useTranslation('setting');
  const preference = useOrchestratorPreference();
  const { role } = useWorkspaceCapabilities();
  const canManage = !preference.workspaceId || role === 'owner' || role === 'admin';
  const [selection, setSelection] = useState<string>();
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>();
  // Preselected only while no default Agent is saved, so saving never silently replaces one.
  const [alsoDefaultChoice, setAlsoDefault] = useState<boolean>();
  const alsoDefault = alsoDefaultChoice ?? (!preference.loading && !preference.defaultAgentId);
  const save = async () => {
    if (!selection || !ready || pending) return;
    setPending(true);
    setError(undefined);
    try {
      await preference.save(selection, { alsoDefault });
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
        alsoDefault={alsoDefault}
        disabled={!canManage || pending || preference.loading}
        value={selection ?? preference.agentId}
        visibility={preference.workspaceId ? 'public' : 'private'}
        onAlsoDefaultChange={setAlsoDefault}
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
        disabled={!canManage || !selection || !ready || pending}
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

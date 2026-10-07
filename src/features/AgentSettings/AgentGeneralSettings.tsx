'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import AutoSaveHint from '@/components/Editor/AutoSaveHint';
import { Input } from '@/components/ui/input';
import { usePermission } from '@/hooks/usePermission';
import { useSaveState } from '@/hooks/useSaveState';
import { useAgentStore } from '@/store/agent';
import { agentSelectors } from '@/store/agent/selectors';

import { SettingsGroup, SettingsRow } from './SettingsGroup';

export const AgentGeneralSettings = ({ agentId }: { agentId: string }) => {
  const { t } = useTranslation('setting');
  const { allowed: canEdit } = usePermission('edit_own_content');
  const meta = useAgentStore(agentSelectors.getAgentMetaById(agentId));
  const update = useAgentStore((s) => s.updateAgentMetaById);
  const [name, setName] = useState(meta.name ?? '');
  const { status, save, lastSavedAt, retry } = useSaveState();
  useEffect(() => setName(meta.name ?? ''), [agentId, meta.name]);
  return (
    <SettingsGroup
      title={t('settingAgent.generalSettings.title')}
      action={
        status !== 'idle' ? (
          <AutoSaveHint
            lastUpdatedTime={lastSavedAt}
            saveStatus={status}
            onRetry={() => void retry()}
          />
        ) : undefined
      }
    >
      <SettingsRow label={t('settingAgent.generalSettings.name')}>
        <Input
          aria-label={t('settingAgent.generalSettings.name')}
          disabled={!canEdit || status === 'saving'}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => {
            const next = name.trim();
            if (next && next !== meta.name)
              void save(() => update(agentId, { name: next }, { rethrow: true }));
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
      </SettingsRow>
    </SettingsGroup>
  );
};

export default AgentGeneralSettings;

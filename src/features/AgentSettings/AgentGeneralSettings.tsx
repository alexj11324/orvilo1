'use client';

import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { createAgentIdentityModal } from '@/features/AgentIdentityModal';
import { usePermission } from '@/hooks/usePermission';
import { useAgentStore } from '@/store/agent';
import { agentSelectors } from '@/store/agent/selectors';

import { SettingsGroup, SettingsRow, settingsStyles } from './SettingsGroup';

interface AgentGeneralSettingsProps {
  agentId: string;
}

/**
 * The agent's General settings group: its display name plus, for a legacy
 * agent (no `heterogeneousProvider`), the one-step migrate CTA — the same
 * materialization the retired engine card offered. Tools/skills are not
 * settings: capabilities reach an agent through ACP mount and the symlink
 * share, so no tool/skill/priority rows exist here.
 */
const AgentGeneralSettings = memo<AgentGeneralSettingsProps>(({ agentId }) => {
  const { t } = useTranslation('setting');
  const { allowed: canEdit } = usePermission('edit_own_content');
  const config = useAgentStore(agentSelectors.getAgentConfigById(agentId));
  const meta = useAgentStore(agentSelectors.getAgentMetaById(agentId));
  const updateAgentConfigById = useAgentStore((s) => s.updateAgentConfigById);
  const legacyRuntime = !config?.agencyConfig?.heterogeneousProvider;
  const personalName = meta.name?.trim();

  return (
    <SettingsGroup title={t('settingAgent.generalSettings.title')}>
      <SettingsRow label={t('settingAgent.generalSettings.name')}>
        <div className="flex items-center gap-2">
          <span className="truncate">{personalName || t('settingAgent.identity.untitled')}</span>
          {canEdit ? (
            <Button size="sm" variant="outline" onClick={() => createAgentIdentityModal(agentId)}>
              {t('settingAgent.identity.edit')}
            </Button>
          ) : null}
        </div>
      </SettingsRow>
      {legacyRuntime ? (
        <SettingsRow label={t('settingAgent.generalSettings.legacyLabel')}>
          <div className="flex flex-col items-start gap-2">
            <div>{t('settingAgent.generalSettings.legacyName')}</div>
            <div className={settingsStyles.hint}>
              {t('settingAgent.generalSettings.legacyDesc')}
            </div>
            <Button
              disabled={!canEdit}
              size="sm"
              onClick={() => {
                void updateAgentConfigById(agentId, {
                  agencyConfig: { heterogeneousProvider: { type: 'orvilo' } },
                });
              }}
            >
              {t('settingAgent.generalSettings.legacyMigrate')}
            </Button>
          </div>
        </SettingsRow>
      ) : null}
    </SettingsGroup>
  );
});

AgentGeneralSettings.displayName = 'AgentGeneralSettings';

export default AgentGeneralSettings;

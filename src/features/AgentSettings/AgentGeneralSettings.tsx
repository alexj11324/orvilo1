'use client';

import { SlidersHorizontalIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import AgentUserTools from '@/features/ProfileEditor/AgentUserTools';
import RunPriorityHint from '@/features/ProfileEditor/AgentUserTools/RunPriorityHint';
import { usePermission } from '@/hooks/usePermission';
import { useAgentStore } from '@/store/agent';
import { agentSelectors } from '@/store/agent/selectors';

import { SettingsGroup, SettingsRow, settingsStyles } from './SettingsGroup';

interface AgentGeneralSettingsProps {
  agentId: string;
}

/**
 * The agent's General settings group: its tools/runtime configuration plus
 * the legacy-runtime migrate CTA. A legacy agent (no `heterogeneousProvider`)
 * still runs the pre-cutover chat runtime — the migrate button materializes
 * `agencyConfig.heterogeneousProvider = { type: 'orvilo' }`, the same one-step
 * the retired engine card offered.
 */
const AgentGeneralSettings = memo<AgentGeneralSettingsProps>(({ agentId }) => {
  const { t } = useTranslation('setting');
  const { allowed: canEdit } = usePermission('edit_own_content');
  const config = useAgentStore(agentSelectors.getAgentConfigById(agentId));
  const updateAgentConfigById = useAgentStore((s) => s.updateAgentConfigById);
  const legacyRuntime = !config?.agencyConfig?.heterogeneousProvider;

  return (
    <SettingsGroup
      action={<RunPriorityHint agentId={agentId} />}
      icon={SlidersHorizontalIcon}
      title={t('settingAgent.generalSettings.title')}
    >
      {legacyRuntime ? (
        <SettingsRow label={t('agentEngine.harness.label')}>
          <div className="flex flex-col items-start gap-2">
            <div>{t('agentEngine.legacy.name')}</div>
            <div className={settingsStyles.hint}>{t('agentEngine.legacy.description')}</div>
            <Button
              disabled={!canEdit}
              size="sm"
              onClick={() => {
                void updateAgentConfigById(agentId, {
                  agencyConfig: { heterogeneousProvider: { type: 'orvilo' } },
                });
              }}
            >
              {t('agentEngine.legacy.migrate')}
            </Button>
          </div>
        </SettingsRow>
      ) : null}
      <SettingsRow>
        {/* The runtime/tools panel — agent-scoped connectors vs the user's
            pinned tools, same content the retired runtime panel rendered. */}
        <AgentUserTools filterAvailableInWeb useAllMetaList />
      </SettingsRow>
    </SettingsGroup>
  );
});

AgentGeneralSettings.displayName = 'AgentGeneralSettings';

export default AgentGeneralSettings;

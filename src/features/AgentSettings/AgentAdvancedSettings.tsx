'use client';

import { ChevronRightIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';

import { SettingsGroup, SettingsRow } from './SettingsGroup';

interface AgentAdvancedSettingsProps {
  agentId: string;
}

/**
 * The agent's Advanced settings group: a single diagnostics link out to the
 * agent's usage/diagnostics surface. Everything else a normal agent needs is
 * covered by the General/Model/Device groups.
 */
const AgentAdvancedSettings = memo<AgentAdvancedSettingsProps>(({ agentId }) => {
  const { t } = useTranslation('setting');
  const navigate = useWorkspaceAwareNavigate();

  return (
    <SettingsGroup title={t('settingAgent.advancedSettings.title')}>
      <SettingsRow label={t('settingAgent.advancedSettings.diagnosticsLabel')}>
        <Button
          className="gap-1 px-2 text-muted-foreground"
          size="sm"
          variant="ghost"
          onClick={() => navigate(`/agent/${agentId}/statistics`)}
        >
          {t('settingAgent.advancedSettings.diagnosticsAction')}
          <ChevronRightIcon size={14} />
        </Button>
      </SettingsRow>
    </SettingsGroup>
  );
});

AgentAdvancedSettings.displayName = 'AgentAdvancedSettings';

export default AgentAdvancedSettings;

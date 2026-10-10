'use client';

import { ChevronRightIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';

import { SettingsRow, settingsStyles } from './SettingsGroup';

interface AgentAdvancedSettingsProps {
  agentId: string;
}

/**
 * A single diagnostics link out to the agent's usage/diagnostics surface, shown
 * as a plain row — there is no "Advanced" section to open first.
 */
const AgentAdvancedSettings = memo<AgentAdvancedSettingsProps>(({ agentId }) => {
  const { t } = useTranslation('setting');
  const navigate = useWorkspaceAwareNavigate();

  return (
    <div className={settingsStyles.group}>
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
    </div>
  );
});

AgentAdvancedSettings.displayName = 'AgentAdvancedSettings';

export default AgentAdvancedSettings;

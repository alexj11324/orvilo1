'use client';

import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAgentSelectionPolicies } from '@/features/ResourcePermission/useAgentSelectionPolicies';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';

import { SettingsGroup, SettingsRow, settingsStyles } from './SettingsGroup';

interface AgentAccessSettingsProps {
  agentId: string;
}

/** Sharing and member selection policies, scoped to workspace agents. */
const AgentAccessSettings = memo<AgentAccessSettingsProps>(({ agentId }) => {
  const { t } = useTranslation('setting');
  const navigate = useWorkspaceAwareNavigate();
  const { canEditPolicies, topicSharePolicy, setTopicSharePolicy } =
    useAgentSelectionPolicies(agentId);

  return (
    <details className="mt-5 rounded-(--radius-card) border px-4 py-3">
      <summary className="cursor-pointer text-sm font-medium">
        {t('settingAgent.accessSettings.title')}
      </summary>
      <SettingsGroup title={t('settingAgent.accessSettings.title')}>
        <SettingsRow label={t('settingAgent.accessSettings.permissions')}>
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate(`/agent/${agentId}/permission`)}
          >
            {t('settingAgent.accessSettings.managePermissions')}
          </Button>
        </SettingsRow>
        <SettingsRow label={t('settingAgent.accessSettings.topicSharing')}>
          <Select
            disabled={!canEditPolicies}
            value={topicSharePolicy}
            items={[
              { value: 'member', label: t('settingAgent.accessSettings.shareMembers') },
              { value: 'restricted', label: t('settingAgent.accessSettings.shareManagers') },
            ]}
            onValueChange={(value) => {
              if (value === 'member' || value === 'restricted') setTopicSharePolicy(value);
            }}
          >
            <SelectTrigger className={settingsStyles.select} size="normal">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="member">
                {t('settingAgent.accessSettings.shareMembers')}
              </SelectItem>
              <SelectItem value="restricted">
                {t('settingAgent.accessSettings.shareManagers')}
              </SelectItem>
            </SelectContent>
          </Select>
        </SettingsRow>
      </SettingsGroup>
    </details>
  );
});

AgentAccessSettings.displayName = 'AgentAccessSettings';

export default AgentAccessSettings;

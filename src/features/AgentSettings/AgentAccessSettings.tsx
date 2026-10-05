'use client';

import type { AgentModelSelectionPolicy } from '@orvilo/types';
import { Bot, LockIcon, UsersIcon } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import PolicySelect, { type PolicyOption } from '@/features/ResourcePermission/PolicySelect';
import { getSelectionPolicyLabelKeys } from '@/features/ResourcePermission/selectionPolicyLabels';
import { useAgentSelectionPolicies } from '@/features/ResourcePermission/useAgentSelectionPolicies';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { useAgentStore } from '@/store/agent';
import { agentByIdSelectors } from '@/store/agent/selectors';

import { SettingsGroup, SettingsRow, settingsStyles } from './SettingsGroup';

interface AgentAccessSettingsProps {
  agentId: string;
}

/**
 * The agent's Access settings group: the member-facing model-switch policy.
 * Device switching lives with the Device group; topic sharing is workspace
 * policy configured on the Permission page, not agent config. Workspace
 * agents only: a personal agent has no members to govern.
 */
const AgentAccessSettings = memo<AgentAccessSettingsProps>(({ agentId }) => {
  const { t } = useTranslation('setting');
  const navigate = useWorkspaceAwareNavigate();
  const isWorkspaceAgent = useAgentStore(agentByIdSelectors.isWorkspaceAgentById(agentId));
  const agent = useAgentStore(agentByIdSelectors.getAgentById(agentId));
  const { canEditPolicies, modelPolicy, setModelPolicy, topicSharePolicy, setTopicSharePolicy } =
    useAgentSelectionPolicies(agentId);

  const isPrivate = agent?.visibility === 'private';
  const labelKeys = getSelectionPolicyLabelKeys(isPrivate);

  const modelPolicyOptions = useMemo(
    (): PolicyOption<AgentModelSelectionPolicy>[] => [
      {
        desc: t('permission.page.modelPolicyMemberDesc'),
        icon: UsersIcon,
        label: t(labelKeys.member),
        value: 'member',
      },
      {
        desc: t('permission.page.modelPolicyFixedDesc'),
        icon: LockIcon,
        label: t(labelKeys.fixed),
        value: 'fixed',
      },
    ],
    [labelKeys, t],
  );

  if (!isWorkspaceAgent) return null;

  return (
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
          <SelectTrigger className={settingsStyles.select}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="member">{t('settingAgent.accessSettings.shareMembers')}</SelectItem>
            <SelectItem value="restricted">
              {t('settingAgent.accessSettings.shareManagers')}
            </SelectItem>
          </SelectContent>
        </Select>
      </SettingsRow>
      <SettingsRow label={t('settingAgent.modelPolicy.title')}>
        <div className="flex flex-col gap-2 w-full">
          <div className="flex items-center gap-2">
            <Bot size={16} />
            <PolicySelect
              disabled={!canEditPolicies}
              options={modelPolicyOptions}
              value={modelPolicy}
              onChange={setModelPolicy}
            />
          </div>
          <div className={settingsStyles.hint}>
            {canEditPolicies
              ? t('permission.page.modelPolicyDesc')
              : t('permission.noManagePermission')}
          </div>
        </div>
      </SettingsRow>
    </SettingsGroup>
  );
});

AgentAccessSettings.displayName = 'AgentAccessSettings';

export default AgentAccessSettings;

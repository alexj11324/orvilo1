'use client';

import type { AgentModelSelectionPolicy, AgentTopicSharePolicy } from '@orvilo/types';
import { Bot, LockIcon, MonitorSmartphone, Share2, ShieldCheckIcon, UsersIcon } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import PolicySelect, { type PolicyOption } from '@/features/ResourcePermission/PolicySelect';
import { getSelectionPolicyLabelKeys } from '@/features/ResourcePermission/selectionPolicyLabels';
import { useAgentSelectionPolicies } from '@/features/ResourcePermission/useAgentSelectionPolicies';
import { useAgentStore } from '@/store/agent';
import { agentByIdSelectors } from '@/store/agent/selectors';

import { SettingsGroup, SettingsRow, settingsStyles } from './SettingsGroup';

interface AgentAccessSettingsProps {
  agentId: string;
}

/**
 * The agent's Access settings group: the member-facing selection policies —
 * who may switch the model, who may pick the execution device, and who may
 * publish conversations as share links. Workspace agents only: a personal
 * agent has no members to govern, so the group renders nothing there (the
 * permission page keeps the access-level row and the audience notices).
 */
const AgentAccessSettings = memo<AgentAccessSettingsProps>(({ agentId }) => {
  const { t } = useTranslation('setting');
  const isWorkspaceAgent = useAgentStore(agentByIdSelectors.isWorkspaceAgentById(agentId));
  const agent = useAgentStore(agentByIdSelectors.getAgentById(agentId));
  const {
    canEditPolicies,
    canFixExecutionTarget,
    executionTargetPolicy,
    modelPolicy,
    setExecutionTargetPolicy,
    setModelPolicy,
    setTopicSharePolicy,
    topicSharePolicy,
  } = useAgentSelectionPolicies(agentId);

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

  const executionPolicyOptions = useMemo(
    (): PolicyOption<AgentModelSelectionPolicy>[] => [
      {
        desc: t('permission.page.devicePolicyMemberDesc'),
        icon: UsersIcon,
        label: t(labelKeys.member),
        value: 'member',
      },
      canFixExecutionTarget
        ? {
            desc: t('permission.page.devicePolicyFixedDesc'),
            icon: LockIcon,
            label: t(labelKeys.fixed),
            value: 'fixed',
          }
        : {
            desc: t('permission.page.devicePolicyUnset'),
            disabled: true,
            icon: LockIcon,
            label: t(labelKeys.fixed),
            value: 'fixed',
          },
    ],
    [canFixExecutionTarget, labelKeys, t],
  );

  const topicSharePolicyOptions = useMemo(
    (): PolicyOption<AgentTopicSharePolicy>[] => [
      {
        desc: t('permission.page.topicSharePolicyMemberDesc'),
        icon: UsersIcon,
        label: t('settingAgent.topicSharePolicy.membersCanShare'),
        value: 'member',
      },
      {
        desc: t('permission.page.topicSharePolicyRestrictedDesc'),
        icon: LockIcon,
        label: t('settingAgent.topicSharePolicy.membersCannotShare'),
        value: 'restricted',
      },
    ],
    [t],
  );

  if (!isWorkspaceAgent) return null;

  const policiesDisabled = !canEditPolicies;

  return (
    <SettingsGroup icon={ShieldCheckIcon} title={t('settingAgent.accessSettings.title')}>
      <SettingsRow label={t('settingAgent.modelPolicy.title')}>
        <div className="flex flex-col gap-2 w-full">
          <div className="flex items-center gap-2">
            <Bot size={16} />
            <PolicySelect
              disabled={policiesDisabled}
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
      <SettingsRow label={t('settingAgent.devicePolicy.title')}>
        <div className="flex flex-col gap-2 w-full">
          <div className="flex items-center gap-2">
            <MonitorSmartphone size={16} />
            <PolicySelect
              disabled={policiesDisabled}
              options={executionPolicyOptions}
              value={executionTargetPolicy}
              onChange={setExecutionTargetPolicy}
            />
          </div>
          <div className={settingsStyles.hint}>
            {canEditPolicies
              ? t('permission.page.devicePolicyDesc')
              : t('permission.noManagePermission')}
          </div>
        </div>
      </SettingsRow>
      <SettingsRow label={t('settingAgent.topicSharePolicy.title')}>
        <div className="flex flex-col gap-2 w-full">
          <div className="flex items-center gap-2">
            <Share2 size={16} />
            <PolicySelect
              disabled={policiesDisabled}
              options={topicSharePolicyOptions}
              value={topicSharePolicy}
              onChange={setTopicSharePolicy}
            />
          </div>
          <div className={settingsStyles.hint}>
            {canEditPolicies
              ? t('permission.page.topicSharePolicyDesc')
              : t('permission.noManagePermission')}
          </div>
        </div>
      </SettingsRow>
    </SettingsGroup>
  );
});

AgentAccessSettings.displayName = 'AgentAccessSettings';

export default AgentAccessSettings;

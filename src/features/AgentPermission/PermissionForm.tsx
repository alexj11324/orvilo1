'use client';

import type { AgentModelSelectionPolicy, AgentTopicSharePolicy } from '@orvilo/types';
import { createStaticStyles } from 'antd-style';
import { Bot, InfoIcon, LockIcon, MonitorSmartphone, Share2, UsersIcon } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncError from '@/components/AsyncError';
import Form, { type FormGroupItemType } from '@/components/GroupForm';
import { Alert, AlertTitle } from '@/components/ui/alert';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { FORM_STYLE } from '@/const/layoutTokens';
import { AgentUseSettings } from '@/features/AgentSettings/AgentUseSettings';
import PolicySelect, { type PolicyOption } from '@/features/ResourcePermission/PolicySelect';
import { getSelectionPolicyLabelKeys } from '@/features/ResourcePermission/selectionPolicyLabels';

import { useAgentPermission } from './useAgentPermission';

const styles = createStaticStyles(({ css }) => ({
  // FormTitle centres the avatar against title+description; a one-line icon
  // should sit on the title instead, so pin it to the top and centre it inside
  // a box the height of the title's own line (`line-height: 1`, inherited size).
  rowIcon: css`
    display: flex;
    align-items: center;
    align-self: flex-start;
    height: 1em;
  `,
}));

interface PermissionFormProps {
  agentId: string;
}

const PermissionForm = memo<PermissionFormProps>(({ agentId }) => {
  const { t } = useTranslation('setting');
  const {
    accessError,
    canEditConfig,
    canEditPolicies,
    canFixExecutionTarget,
    executionTargetPolicy,
    isPrivate,
    isWorkspaceAgent,
    modelPolicy,
    retryAccess,
    setExecutionTargetPolicy,
    setModelPolicy,
    setTopicSharePolicy,
    topicSharePolicy,
  } = useAgentPermission(agentId);

  const labelKeys = getSelectionPolicyLabelKeys(isPrivate);

  // Same shape as the access-level options: the label is the decision, the
  // description says what it means for a member day to day.
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

  // Policy writes use the same creator/Owner/Admin Manage boundary as config.
  const policiesDisabled = !canEditConfig || !canEditPolicies;

  // Deliberately not a `member`/`fixed` pair like the rows below: sharing is a
  // capability, not a setting members switch, so the labels name who may do it.
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

  const executionPolicyOptions = useMemo(
    (): PolicyOption<AgentModelSelectionPolicy>[] => [
      {
        desc: t('permission.page.devicePolicyMemberDesc'),
        icon: UsersIcon,
        label: t(labelKeys.member),
        value: 'member',
      },
      // Nothing to pin to yet — say so where the choice is made rather than
      // letting the click fail silently.
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

  if (!isWorkspaceAgent) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LockIcon />
          </EmptyMedia>
          <EmptyTitle>{t('permission.page.personalTitle')}</EmptyTitle>
          <EmptyDescription>{t('permission.page.personalDesc')}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const memberGroup: FormGroupItemType | undefined = !accessError
    ? {
        children: [
          {
            avatar: (
              <span className={styles.rowIcon}>
                <Share2 size={16} />
              </span>
            ),
            children: (
              <PolicySelect
                disabled={policiesDisabled}
                options={topicSharePolicyOptions}
                value={topicSharePolicy}
                onChange={setTopicSharePolicy}
              />
            ),
            desc: canEditPolicies
              ? t('permission.page.topicSharePolicyDesc')
              : t('permission.noManagePermission'),
            label: t('settingAgent.topicSharePolicy.title'),
          },
        ],
        title: t('permission.page.memberGroup'),
      }
    : undefined;

  const configGroup: FormGroupItemType = {
    children: [
      {
        avatar: (
          <span className={styles.rowIcon}>
            <Bot size={16} />
          </span>
        ),
        children: (
          <PolicySelect
            disabled={policiesDisabled}
            options={modelPolicyOptions}
            value={modelPolicy}
            onChange={setModelPolicy}
          />
        ),
        desc: canEditPolicies
          ? t('permission.page.modelPolicyDesc')
          : t('permission.noManagePermission'),
        label: t('settingAgent.modelPolicy.title'),
      },
      {
        avatar: (
          <span className={styles.rowIcon}>
            <MonitorSmartphone size={16} />
          </span>
        ),
        children: (
          <PolicySelect
            disabled={policiesDisabled}
            options={executionPolicyOptions}
            value={executionTargetPolicy}
            onChange={setExecutionTargetPolicy}
          />
        ),
        desc: canEditPolicies
          ? t('permission.page.devicePolicyDesc')
          : t('permission.noManagePermission'),
        label: t('settingAgent.devicePolicy.title'),
      },
    ],
    title: t('permission.page.configGroup'),
  };

  return (
    <>
      {/* A failed permission fetch must not read as "this agent has no member
          permissions" — name the failure and keep a way back to the data. */}
      {accessError ? (
        <AsyncError error={accessError} variant={'inline'} onRetry={retryAccess} />
      ) : null}
      {/* Everything below describes what happens once the agent is shared, so
          say that once, up front, instead of qualifying each control. */}
      {isPrivate ? (
        <Alert style={{ width: '100%' }} variant="info">
          <InfoIcon />
          <AlertTitle>{t('permission.page.privateNotice')}</AlertTitle>
        </Alert>
      ) : null}
      <AgentUseSettings agentId={agentId} />
      <Form
        items={[...(memberGroup ? [memberGroup] : []), configGroup]}
        itemsType={'group'}
        variant={'filled'}
        {...FORM_STYLE}
      />
    </>
  );
});

PermissionForm.displayName = 'PermissionForm';

export default PermissionForm;
